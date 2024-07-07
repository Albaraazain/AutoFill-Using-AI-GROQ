let currentApiKeyIndex = 0;
let apiKeys = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Received message:", request);
    if (request.action === "fillField") {
        handleIndividualFieldFill(request, sender, sendResponse);
    } else if (request.action === "fillForm" || request.action === "batchFill") {
        handleBatchFill(request, sender, sendResponse);
    } else {
        sendResponse({status: "error", message: "Unknown action"});
    }
    return true; // Indicates that the response is sent asynchronously
});

function handleBatchFill(request, sender, sendResponse) {
    const tabId = sender.tab ? sender.tab.id : null;
    if (!tabId) {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            if (tabs && tabs[0]) {
                processBatchFill(request, tabs[0].id, sendResponse);
            } else {
                console.error('No active tab found');
                sendResponse({status: "error", message: "No active tab found"});
            }
        });
    } else {
        processBatchFill(request, tabId, sendResponse);
    }
}

function generateFieldPrompt(fieldInfo, userData) {
    return `
    The form field is asking for: ${fieldInfo.context}
    Field type: ${fieldInfo.fieldType}
    Field name: ${fieldInfo.fieldName}
    ${fieldInfo.additionalPrompt ? `Additional specifications: ${fieldInfo.additionalPrompt}` : ''}

    Based on this user data:
    ${JSON.stringify(userData, null, 2)}

    Provide the appropriate value for this field.
    Return a JSON object with a "value" key containing the appropriate value from the user data.
    If you can't determine a suitable value, return an empty string.
    Example response: {"value": "John Doe"}
    `;
}


function handleIndividualFieldFill(request, sender, sendResponse) {
    const tabId = sender.tab ? sender.tab.id : null;
    if (!tabId) {
        console.error('No tab information available for individual field fill');
        sendResponse({status: "error", message: "No tab information available"});
        return;
    }

    getUserData().then(userData => {
        const fieldPrompt = generateFieldPrompt(request, userData);
        callGroqAPI(fieldPrompt, "llama3-70b-8192")
            .then(response => {
                chrome.tabs.sendMessage(tabId, {
                    action: "fillField",
                    value: response.value || ''
                });
                sendResponse({status: "success"});
            })
            .catch(error => {
                console.error('Error in individual field fill:', error);
                sendResponse({status: "error", message: error.toString()});
            });
    });
}


function processBatchFill(request, tabId, sendResponse) {
    batchProcessFormFields(request.fields, request.userData, tabId)
        .then(() => {
            console.log("Batch form processing complete");
            sendResponse({status: "success"});
        })
        .catch(error => {
            console.error('Error in batch processing:', error);
            sendResponse({status: "error", message: error.toString()});
        });
}

async function batchProcessFormFields(fields, userData, tabId) {
    console.log(`Batch processing ${fields.length} fields for tab ${tabId}`);

    const batchPrompt = generateBatchPrompt(fields, userData);
    console.log("Batch prompt:", batchPrompt);

    try {
        const batchResponse = await callGroqAPI(batchPrompt, "llama3-70b-8192");
        console.log("Batch response:", batchResponse);

        if (batchResponse) {
            const values = fields.map((field, index) => batchResponse[`Field ${index}`] || '');
            await new Promise((resolve) => {
                chrome.tabs.sendMessage(tabId, {
                    action: "batchFillFields",
                    values: values
                }, resolve);
            });
        }
    } catch (error) {
        console.error('Error in batch processing:', error);
        throw error;
    }
}

function generateBatchPrompt(fields, userData) {
    const fieldDescriptions = fields.map((field, index) =>
        `Field ${index}: ${field.label ? 'Label: ' + field.label + '\n' : ''}${field.htmlContext}`
    ).join('\n\n');

    return `
Analyze the following form fields:
${fieldDescriptions}

Based on this user data:
${JSON.stringify(userData, null, 2)}

For each field, determine its purpose (prioritizing the label if present) and provide an appropriate value from the user data.
Return a JSON object with the key as the "Field" and number (e.g., "Field 0", "Field 1") and the value as the matched value of the field.

For text and textarea fields, provide the appropriate text.
For select fields, provide the exact text of the option that should be selected.
For checkbox and radio fields, respond with "true" if it should be checked, or "false" if it should be unchecked.

If you can't determine a suitable value for a field, use an empty string.

Important: Fill the form using the provided user data, not examples.

Example response format (DO NOT USE THESE VALUES, USE THE ACTUAL USER DATA):
{
  "Field 0": "John",
  "Field 1": "Wick",
  "Field 2": "true",
  "Field 3": "Option 2"
}
`;
}

async function callGroqAPI(prompt, model, retries = 3) {
    if (apiKeys.length === 0) {
        await loadApiKeys();
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKeys[currentApiKeyIndex]}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that analyzes and fills out form fields. You should return results as JSON format."
                    },
                    {role: "user", content: prompt}
                ],
                temperature: 0.5,
                max_tokens: 500,
                response_format: {type: "json_object"},
            })
        });

        if (response.status === 429) {
            throw new Error('Rate limit exceeded');
        }

        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
    } catch (error) {
        if (error.message === 'Rate limit exceeded') {
            console.log(`API key ${currentApiKeyIndex + 1} rate limited. Trying next key.`);
            currentApiKeyIndex = (currentApiKeyIndex + 1) % apiKeys.length;

            if (currentApiKeyIndex === 0 && retries > 1) {
                console.log('All keys rate limited. Waiting for 1 minute before retrying...');
                await new Promise(resolve => setTimeout(resolve, 60000));
                return callGroqAPI(prompt, model, retries - 1);
            } else if (retries <= 1) {
                throw new Error('All API keys rate limited after multiple retries');
            }

            return callGroqAPI(prompt, model, retries);
        }
        throw error;
    }
}

async function loadApiKeys() {
    return new Promise((resolve) => {
        chrome.storage.sync.get('apiKeys', (data) => {
            apiKeys = data.apiKeys || [];
            resolve();
        });
    });
}

async function getUserData() {
    return new Promise((resolve) => {
        chrome.storage.sync.get('userData', (data) => {
            resolve(data.userData || {});
        });
    });
}

// Load API keys when the background script starts
loadApiKeys();

console.log("Background script loaded");