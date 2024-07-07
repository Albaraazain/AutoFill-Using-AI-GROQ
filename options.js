document.addEventListener('DOMContentLoaded', function() {
    const addApiKeyButton = document.getElementById('addApiKey');
    const newApiKeyInput = document.getElementById('newApiKey');
    const apiKeysDiv = document.getElementById('apiKeys');
    const statusDiv = document.getElementById('status');

    // Load saved API keys
    loadApiKeys();

    addApiKeyButton.addEventListener('click', function() {
        const newKey = newApiKeyInput.value.trim();
        if (newKey) {
            chrome.storage.sync.get({apiKeys: []}, function(data) {
                const apiKeys = data.apiKeys;
                if (!apiKeys.includes(newKey)) {
                    apiKeys.push(newKey);
                    chrome.storage.sync.set({apiKeys: apiKeys}, function() {
                        newApiKeyInput.value = '';
                        loadApiKeys();
                        showStatus('API key added successfully!', 'text-green-500');
                    });
                } else {
                    showStatus('This API key already exists.', 'text-yellow-500');
                }
            });
        }
    });

    function loadApiKeys() {
        chrome.storage.sync.get({apiKeys: []}, function(data) {
            const apiKeys = data.apiKeys;
            apiKeysDiv.innerHTML = '';
            apiKeys.forEach(function(key, index) {
                const keyElement = document.createElement('div');
                keyElement.className = 'flex justify-between items-center bg-white p-3 rounded-lg shadow-sm';
                keyElement.innerHTML = `
                    <span class="text-gray-700">${maskApiKey(key)}</span>
                    <button class="removeKey text-red-500 hover:text-red-700 transition-colors duration-200" data-index="${index}">Remove</button>
                `;
                apiKeysDiv.appendChild(keyElement);

                // Add fade-in animation
                gsap.from(keyElement, {opacity: 0, y: -10, duration: 0.3, delay: index * 0.1});
            });
            addRemoveListeners();
        });
    }

    function addRemoveListeners() {
        const removeButtons = document.querySelectorAll('.removeKey');
        removeButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-index'));
                chrome.storage.sync.get({apiKeys: []}, function(data) {
                    const apiKeys = data.apiKeys;
                    apiKeys.splice(index, 1);
                    chrome.storage.sync.set({apiKeys: apiKeys}, function() {
                        loadApiKeys();
                        showStatus('API key removed successfully!', 'text-green-500');
                    });
                });
            });
        });
    }

    function maskApiKey(key) {
        return key.substring(0, 4) + '•'.repeat(key.length - 8) + key.substring(key.length - 4);
    }

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

    // Add animation to the Add API Key button
    gsap.utils.toArray('#addApiKey, #newApiKey').forEach(element => {
        element.addEventListener('mouseenter', () => gsap.to(element, {scale: 1.05, duration: 0.2}));
        element.addEventListener('mouseleave', () => gsap.to(element, {scale: 1, duration: 0.2}));
        element.addEventListener('mousedown', () => gsap.to(element, {scale: 0.95, duration: 0.1}));
        element.addEventListener('mouseup', () => gsap.to(element, {scale: 1, duration: 0.1}));
    });
});