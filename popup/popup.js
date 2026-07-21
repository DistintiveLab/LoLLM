document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('settings-form');
    const apiKeyInput = document.getElementById('api-key');
    const endpointInput = document.getElementById('endpoint-url');
    const modelInput = document.getElementById('model');
    const testBtn = document.getElementById('test-btn');
    const testResult = document.getElementById('test-result');

    function setResult(text, kind, tried) {
        testResult.textContent = '';
        testResult.className = 'test-result' + (kind ? ' ' + kind : '');
        if (text) {
            const p = document.createElement('div');
            p.textContent = text;
            testResult.appendChild(p);
        }
        if (tried && tried.length) {
            const label = document.createElement('div');
            label.textContent = 'Tried:';
            label.style.marginTop = '8px';
            testResult.appendChild(label);
            const ul = document.createElement('ul');
            tried.forEach(function (t) {
                const li = document.createElement('li');
                li.textContent = t.endpoint + ' \u2192 ' + t.detail;
                ul.appendChild(li);
            });
            testResult.appendChild(ul);
        }
    }

    // Load saved settings
    browser.storage.local.get(['apiKey', 'endpointUrl', 'model'], function (data) {
        if (data.apiKey) apiKeyInput.value = data.apiKey;
        if (data.endpointUrl) endpointInput.value = data.endpointUrl;
        if (data.model) modelInput.value = data.model;
    });

    // Save settings
    form.addEventListener('submit', function (event) {
        event.preventDefault();
        browser.storage.local.set({
            apiKey: apiKeyInput.value.trim(),
            endpointUrl: endpointInput.value.trim(),
            model: modelInput.value.trim()
        }, function () {
            window.close();
        });
    });

    // Test connection
    testBtn.addEventListener('click', async function () {
        const apiKey = apiKeyInput.value.trim();
        const endpointUrl = endpointInput.value.trim();
        const model = modelInput.value.trim();
        if (!apiKey) {
            setResult('Enter an API key first.', 'err');
            return;
        }
        testBtn.disabled = true;
        setResult('Testing\u2026');
        try {
            const res = await browser.runtime.sendMessage({
                action: 'test-connection',
                apiKey: apiKey,
                endpointUrl: endpointUrl,
                model: model,
            });

            if (res && res.ok) {
                setResult(res.message, 'ok', res.tried);
                return;
            }

            if (res && res.suggestion) {
                const useIt = confirm(res.suggestion.autoMessage);
                if (useIt) {
                    endpointInput.value = res.suggestion.endpoint;
                    browser.storage.local.set({
                        apiKey: apiKey,
                        endpointUrl: res.suggestion.endpoint,
                        model: model,
                    });
                    setResult('Switched to ' + res.suggestion.endpoint +
                        '\nNow test again to confirm the API key and model work.', 'ok');
                    return;
                }
            }

            setResult(res ? res.message : 'No response from background.', 'err', res && res.tried);
        } catch (e) {
            setResult('Error: ' + e.message, 'err');
        } finally {
            testBtn.disabled = false;
        }
    });
});
