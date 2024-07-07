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
    selectedField = findEditableElement(event.target);
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

function findEditableElement(element) {
    // Check if the element itself is editable
    if (isEditableElement(element)) {
        return element;
    }

    // If not, check its parents
    let parent = element.parentElement;
    while (parent) {
        if (isEditableElement(parent)) {
            return parent;
        }
        parent = parent.parentElement;
    }

    return null;
}

function isEditableElement(element) {
    const editableTags = ['INPUT', 'TEXTAREA', 'SELECT'];
    const editableTypes = ['text', 'password', 'email', 'number', 'tel', 'url', 'search', 'date', 'time', 'datetime-local', 'month', 'week'];

    return (
        editableTags.includes(element.tagName) ||
        (element.tagName === 'INPUT' && editableTypes.includes(element.type)) ||
        element.isContentEditable ||
        (element.getAttribute('role') === 'textbox') ||
        (element.getAttribute('contenteditable') === 'true')
    );
}

function highlightField(field) {
    field.classList.add('groq-field-highlight');
    setTimeout(() => {
        field.classList.remove('groq-field-highlight');
    }, 2000);
}

function findLabel(field) {
    // First, try to find a label that's explicitly associated with the field
    let label = field.labels && field.labels.length ? field.labels[0] : null;

    if (!label) {
        // Look for a preceding label sibling
        label = field.previousElementSibling;
        if (label && label.tagName !== 'LABEL') {
            label = null;
        }
    }

    if (!label) {
        // Look for a parent label
        label = field.closest('label');
    }

    if (!label && field.id) {
        // Look for a label that references this field by id
        label = document.querySelector(`label[for="${field.id}"]`);
    }

    // If still no label, look for nearby text that might serve as a label
    if (!label) {
        const parent = field.parentElement;
        const siblings = Array.from(parent.childNodes);
        const fieldIndex = siblings.indexOf(field);
        for (let i = fieldIndex - 1; i >= 0; i--) {
            const sibling = siblings[i];
            if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) {
                return sibling.textContent.trim();
            }
            if (sibling.nodeType === Node.ELEMENT_NODE && sibling.textContent.trim()) {
                return sibling.textContent.trim();
            }
        }
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
        fieldType: getFieldType(field),
        fieldName: field.name || field.id || '',
        context: context,
        additionalPrompt: additionalPrompt
    });
}

function getFieldType(field) {
    if (field.tagName === 'INPUT') {
        return field.type.toLowerCase();
    }
    if (field.tagName === 'TEXTAREA') {
        return 'textarea';
    }
    if (field.tagName === 'SELECT') {
        return 'select';
    }
    if (field.isContentEditable || field.getAttribute('contenteditable') === 'true') {
        return 'contenteditable';
    }
    if (field.getAttribute('role') === 'textbox') {
        return 'textbox';
    }
    return 'unknown';
}

// Listen for messages from the background script
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
    const fieldType = getFieldType(field);

    switch (fieldType) {
        case 'checkbox':
        case 'radio':
            field.checked = value.toLowerCase() === 'true' || value.toLowerCase() === 'checked';
            break;
        case 'select':
            const option = Array.from(field.options).find(opt =>
                opt.text.toLowerCase() === value.toLowerCase() ||
                opt.value.toLowerCase() === value.toLowerCase()
            );
            if (option) {
                option.selected = true;
            } else {
                console.warn(`Could not find matching option for select field. Value: ${value}`);
            }
            break;
        case 'contenteditable':
        case 'textbox':
            field.textContent = value;
            break;
        default:
            field.value = value;
    }

    // Trigger events
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));

    // Highlight the filled field
    highlightField(field);
}

console.log("Content script loaded");