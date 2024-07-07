
document.addEventListener('DOMContentLoaded', function() {
    const fillFormButton = document.getElementById('fillForm');
    const userDataTextarea = document.getElementById('userData');
    const statusDiv = document.getElementById('status');
    const saveDataButton = document.getElementById('saveData');
    const optionsButton = document.getElementById('options');

    // Load saved user data when popup opens
    chrome.storage.sync.get(['userData'], function(result) {
        if (result.userData) {
            userDataTextarea.value = JSON.stringify(result.userData, null, 2);
        }
    });

    saveDataButton.addEventListener('click', function() {
        let userData;
        try {
            userData = JSON.parse(userDataTextarea.value);
            chrome.storage.sync.set({userData: userData}, function() {
                showStatus('User data saved successfully!', 'text-green-500');
            });
        } catch (e) {
            showStatus('Invalid JSON. Please check your input.', 'text-red-500');
        }
    });

    fillFormButton.addEventListener('click', function() {
        processForm();
    });

    function processForm() {
        let userData;
        try {
            userData = JSON.parse(userDataTextarea.value);
        } catch (e) {
            showStatus('Invalid JSON. Please check your input.', 'text-red-500');
            return;
        }

        showStatus('Processing form...', 'text-blue-500 loading');

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs && tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {action: "getFields"}, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError);
                        showStatus(`Error: ${chrome.runtime.lastError.message}`, 'text-red-500');
                        return;
                    }
                    if (response && response.fields) {
                        chrome.runtime.sendMessage({
                            action: "batchFill",
                            fields: response.fields,
                            userData: userData
                        }, function(response) {
                            if (chrome.runtime.lastError) {
                                console.error(chrome.runtime.lastError);
                                showStatus(`Error: ${chrome.runtime.lastError.message}`, 'text-red-500');
                            } else if (response && response.status) {
                                showStatus(response.status === "success" ?
                                    "Form fill completed successfully!" :
                                    "Error in form fill", response.status === "success" ? 'text-green-500' : 'text-red-500');
                            } else {
                                showStatus("Unexpected error occurred", 'text-red-500');
                            }
                        });
                    } else {
                        showStatus("No form fields found", 'text-yellow-500');
                    }
                });
            } else {
                showStatus("No active tab found", 'text-yellow-500');
            }
        });
    }

    optionsButton.addEventListener('click', function() {
        chrome.runtime.openOptionsPage();
    });

    function showStatus(message, className) {
        statusDiv.textContent = message;
        statusDiv.className = `text-sm ${className} mb-4 fade-in`;
        gsap.fromTo(statusDiv, {opacity: 0, y: -10}, {opacity: 1, y: 0, duration: 0.5});
        setTimeout(() => {
            gsap.to(statusDiv, {opacity: 0, y: 10, duration: 0.5, onComplete: () => {
                    statusDiv.textContent = '';
                    statusDiv.className = 'text-sm text-gray-600 mb-4';
                }});
        }, 3000);
    }

    // Add animation to buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', () => {
            gsap.to(button, {scale: 1.05, duration: 0.2});
        });
        button.addEventListener('mouseleave', () => {
            gsap.to(button, {scale: 1, duration: 0.2});
        });
        button.addEventListener('mousedown', () => {
            gsap.to(button, {scale: 0.95, duration: 0.1});
        });
        button.addEventListener('mouseup', () => {
            gsap.to(button, {scale: 1, duration: 0.1});
        });
    });
});

let selectedField = null;
let selectedText = '';
let customPopup = null;

// Listen for text selection
document.addEventListener('mouseup', function(event) {
    const selection = window.getSelection().toString().trim();
    if (selection) {
        selectedText = selection;
    }
});

document.addEventListener('mousedown', function(event) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        handleFieldSelection(event, false);
    } else if (event.altKey && !(event.ctrlKey || event.metaKey)) {
        handleFieldSelection(event, true);
    }
});

function handleFieldSelection(event, withPrompt) {
    event.preventDefault();
    selectedField = event.target.closest('input, textarea, select');
    if (selectedField) {
        highlightField(selectedField);
        const label = findLabel(selectedField);
        const context = selectedText || label || 'Unnamed field';

        if (withPrompt) {
            showCustomPopup(selectedField, context);
        } else {
            sendToBackground(selectedField, context);
        }

        selectedText = ''; // Reset selected text after using it
    }
}

function highlightField(field) {
    field.classList.add('groq-field-highlight');
    setTimeout(() => {
        field.classList.remove('groq-field-highlight');
    }, 2000);
}

function findLabel(field) {
    let label = field.labels[0];
    if (!label) {
        label = field.closest('label') ||
            document.querySelector(`label[for="${field.id}"]`);
    }
    return label ? label.textContent.trim() : '';
}

function showCustomPopup(field, context) {
    if (customPopup) {
        document.body.removeChild(customPopup);
    }

    customPopup = document.createElement('div');
    customPopup.className = 'groq-custom-popup';
    customPopup.innerHTML = `
        <h3>Enhance Field Fill</h3>
        <p>Provide additional context for: <strong>${context}</strong></p>
        <textarea id="additionalPrompt" placeholder="Enter any additional specifications or context for this field..."></textarea>
        <div class="button-group">
            <button id="submitPrompt">Enhance & Fill</button>
            <button id="cancelPrompt">Cancel</button>
        </div>
    `;

    document.body.appendChild(customPopup);

    const rect = field.getBoundingClientRect();
    const popupRect = customPopup.getBoundingClientRect();

    let top = rect.bottom + window.scrollY + 10;
    let left = rect.left + window.scrollX;

    // Adjust position if it goes off-screen
    if (top + popupRect.height > window.innerHeight) {
        top = rect.top + window.scrollY - popupRect.height - 10;
    }
    if (left + popupRect.width > window.innerWidth) {
        left = window.innerWidth - popupRect.width - 10;
    }

    customPopup.style.top = `${top}px`;
    customPopup.style.left = `${left}px`;

    const submitButton = document.getElementById('submitPrompt');
    const cancelButton = document.getElementById('cancelPrompt');
    const textarea = document.getElementById('additionalPrompt');

    submitButton.addEventListener('click', () => {
        const additionalPrompt = textarea.value;
        sendToBackground(field, context, additionalPrompt);
        removeCustomPopup();
    });

    cancelButton.addEventListener('click', removeCustomPopup);

    // Close popup when clicking outside
    document.addEventListener('mousedown', handleOutsideClick);

    // Add focus to textarea
    textarea.focus();
}

function handleOutsideClick(event) {
    if (customPopup && !customPopup.contains(event.target) && event.target !== selectedField) {
        removeCustomPopup();
    }
}

function removeCustomPopup() {
    if (customPopup) {
        document.body.removeChild(customPopup);
        customPopup = null;
        document.removeEventListener('mousedown', handleOutsideClick);
    }
}

function sendToBackground(field, context, additionalPrompt = null) {
    chrome.runtime.sendMessage({
        action: 'fillField',
        fieldType: field.tagName.toLowerCase(),
        fieldName: field.name || field.id,
        context: context,
        additionalPrompt: additionalPrompt
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Received message in content script:", request);
    if (request.action === "getFields") {
        sendResponse({fields: getFormFields()});
    } else if (request.action === "batchFillFields") {
        batchFillFormFields(request.values);
        sendResponse({status: "success"});
    } else if (request.action === "fillField") {
        if (selectedField) {
            fillField(selectedField, request.value);
            selectedField = null;
        }
        sendResponse({status: "success"});
    }
    return true; // Indicates that the response is sent asynchronously
});

function getFormFields() {
    const formElements = document.querySelectorAll('form, div[role="form"]');
    const fields = [];

    formElements.forEach(form => {
        const inputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
        inputs.forEach((input, index) => {
            const field = {
                index: index,
                type: input.type || input.tagName.toLowerCase(),
                name: input.name || '',
                id: input.id || '',
                placeholder: input.placeholder || '',
                value: input.value || '',
                label: getLabelForField(input),
                htmlContext: getHtmlContext(input)
            };
            if (input.tagName.toLowerCase() === 'select') {
                field.options = Array.from(input.options).map(option => option.text);
            }
            fields.push(field);
        });
    });

    return fields;
}

function getLabelForField(input) {
    // Check for a label element associated with the input
    let label = input.labels && input.labels.length > 0 ? input.labels[0].textContent.trim() : null;

    // If no label found, check for aria-label attribute
    if (!label && input.getAttribute('aria-label')) {
        label = input.getAttribute('aria-label').trim();
    }

    // If still no label, check for a preceding sibling that might be acting as a label
    if (!label) {
        let previousElement = input.previousElementSibling;
        if (previousElement && ['LABEL', 'SPAN', 'DIV'].includes(previousElement.tagName)) {
            label = previousElement.textContent.trim();
        }
    }

    // If still no label, check for a parent element with role="heading"
    if (!label) {
        let parentWithHeading = input.closest('[role="heading"]');
        if (parentWithHeading) {
            label = parentWithHeading.textContent.trim();
        }
    }

    return label || '';
}

function getHtmlContext(input) {
    let contextLines = [];
    let currentElement = input.parentElement;
    let stopCollecting = false;
    let depth = 0;
    const maxDepth = 10; // Prevent infinite loops

    // Add field type-specific information
    if (input.tagName === 'SELECT') {
        let options = Array.from(input.options).map(option => option.text);
        contextLines.push(`Select options: ${options.join(', ')}`);
    } else if (input.type === 'checkbox' || input.type === 'radio') {
        contextLines.push(`${input.type.charAt(0).toUpperCase() + input.type.slice(1)} state: ${input.checked ? 'Checked' : 'Unchecked'}`);
    }

    function isFormField(element) {
        return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT';
    }

    // Add label to context if it exists
    let label = getLabelForField(input);
    if (label) {
        contextLines.push(`Label: ${label}`);
    }

    while (currentElement && currentElement.tagName !== 'BODY' && !stopCollecting && depth < maxDepth) {
        let children = Array.from(currentElement.childNodes);
        let inputIndex = children.indexOf(input);

        for (let i = inputIndex - 1; i >= 0; i--) {
            let child = children[i];

            if (isFormField(child)) {
                stopCollecting = true;
                break;
            }

            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                let text = child.textContent.trim();
                contextLines.push(text);
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                if (child.querySelector('input, textarea, select')) {
                    stopCollecting = true;
                    break;
                }
                let text = child.textContent.trim();
                if (text) {
                    contextLines.push(text);
                }
            }
        }

        if (!stopCollecting) {
            input = currentElement;
            currentElement = currentElement.parentElement;
            depth++;
        }
    }

    // Limit to the last 15 lines
    contextLines = contextLines.slice(-15);

    // Format the final output
    let formattedContext = contextLines.map((text, index) => `${index + 1}: ${text}`).join('\n');

    return formattedContext.trim();
}

function fillFormField(fieldIndex, value) {
    const formElements = document.querySelectorAll('form, div[role="form"]');
    let currentIndex = 0;

    formElements.forEach(form => {
        const inputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
        inputs.forEach((input) => {
            if (currentIndex === fieldIndex) {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    input.checked = value.toLowerCase() === 'true' || value.toLowerCase() === 'checked';
                } else if (input.tagName === 'SELECT') {
                    const option = Array.from(input.options).find(opt => opt.text.toLowerCase() === value.toLowerCase());
                    if (option) {
                        option.selected = true;
                    }
                } else {
                    input.value = value;
                }

                input.dispatchEvent(new Event('input', {bubbles: true}));
                input.dispatchEvent(new Event('change', {bubbles: true}));

                // Highlight the filled field
                input.style.backgroundColor = 'yellow';
                setTimeout(() => {
                    input.style.backgroundColor = '';
                }, 2000);
            }
            currentIndex++;
        });
    });
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fillField' && selectedField) {
        selectedField.value = request.value;
        selectedField.dispatchEvent(new Event('input', { bubbles: true }));
        selectedField.dispatchEvent(new Event('change', { bubbles: true }));
        selectedField = null;
    } else if (request.action === "getFields") {
        sendResponse({fields: getFormFields()});
    } else if (request.action === "fillField") {
        fillFormField(request.fieldIndex, request.value);
        sendResponse({status: "success"});
    } else if (request.action === "batchFillFields") {
        batchFillFormFields(request.values);
        sendResponse({status: "success"});
    }
    return true; // Indicates that the response is sent asynchronously
});

// Function to safely send messages to the background script
function safelySendMessage(message) {
    if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                console.log("Failed to send message:", chrome.runtime.lastError);
                // If the context is invalidated, stop trying to send messages
                clearInterval(formDetectionInterval);
            }
        });
    } else {
        console.log("Chrome runtime is not available. Extension context may be invalidated.");
        clearInterval(formDetectionInterval);
    }
}

// Periodically check for new forms and inform the background script
const formDetectionInterval = setInterval(() => {
    const fields = getFormFields();
    if (fields.length > 0) {
        safelySendMessage({action: "formsDetected", fields: fields});
    }
}, 5000);  // Check every 5 seconds

// Inform the background script that the content script has loaded
chrome.runtime.sendMessage({action: "contentScriptLoaded"}, (response) => {
    if (chrome.runtime.lastError) {
        console.log("Failed to send contentScriptLoaded message:", chrome.runtime.lastError);
    }
});

function batchFillFormFields(values) {
    const formElements = document.querySelectorAll('form, div[role="form"]');
    let currentIndex = 0;

    formElements.forEach(form => {
        const inputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
        inputs.forEach((input) => {
            if (currentIndex < values.length) {
                const value = values[currentIndex];
                fillField(input, value);
                currentIndex++;
            }
        });
    });
}

function fillField(field, value) {
    console.log(`Filling field:`, field, `with value:`, value);
    if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = value.toLowerCase() === 'true' || value.toLowerCase() === 'checked';
    } else if (field.tagName === 'SELECT') {
        const option = Array.from(field.options).find(opt =>
            opt.text.toLowerCase() === value.toLowerCase() ||
            opt.value.toLowerCase() === value.toLowerCase()
        );
        if (option) {
            option.selected = true;
        } else {
            console.warn(`Could not find matching option for select field. Value: ${value}`);
        }
    } else {
        field.value = value;
    }

    function fillField(field, value) {
        console.log(`Filling field:`, field, `with value:`, value);
        if (field.type === 'checkbox' || field.type === 'radio') {
            field.checked = value.toLowerCase() === 'true' || value.toLowerCase() === 'checked';
        } else if (field.tagName === 'SELECT') {
            const option = Array.from(field.options).find(opt =>
                opt.text.toLowerCase() === value.toLowerCase() ||
                opt.value.toLowerCase() === value.toLowerCase()
            );
            if (option) {
                option.selected = true;
            } else {
                console.warn(`Could not find matching option for select field. Value: ${value}`);
            }
        } else {
            field.value = value;
        }

        // Trigger events
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));

        // Highlight the filled field
        const originalBackground = field.style.backgroundColor;
        field.style.backgroundColor = 'yellow';
        setTimeout(() => {
            field.style.backgroundColor = originalBackground;
        }, 2000);
    }

    // Trigger events
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));

    // Highlight the filled field
    const originalBackground = field.style.backgroundColor;
    field.style.backgroundColor = 'yellow';
    setTimeout(() => {
        field.style.backgroundColor = originalBackground;
    }, 2000);
}

console.log("Content script loaded");