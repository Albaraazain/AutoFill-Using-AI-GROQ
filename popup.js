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

    // Add subtle animations to buttons
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

    // Add a subtle animation to the textarea
    userDataTextarea.addEventListener('focus', () => {
        gsap.to(userDataTextarea, {boxShadow: '0 0 0 3px rgba(66, 153, 225, 0.5)', duration: 0.3});
    });
    userDataTextarea.addEventListener('blur', () => {
        gsap.to(userDataTextarea, {boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)', duration: 0.3});
    });
});