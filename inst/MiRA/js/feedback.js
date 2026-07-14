/**
 * feedback.js — "Feedback" dialog subsystem (button, modal form, submit).
 *
 * Owns the feedback UI in its entirety:
 *   - The Google Form backend constants (form action + entry.* field IDs).
 *   - Opening/closing the modal, validation, and the char counter.
 *   - Building the optional diagnostics block and its live preview.
 *   - Submitting to the Google Form formResponse endpoint (no-cors), so
 *     responses record as rows in the linked Google Sheet — no backend,
 *     no secret in the client.
 *
 * Exports:
 *   - initFeedback(getContext)
 *       Wires every listener. Call once during app init. `getContext` is a
 *       callback returning the live app state used in diagnostics:
 *         () => ({ mode, model, datasetName })
 *       It is read fresh at submit/preview time so diagnostics reflect the
 *       current view (mirrors how demoDatasets.js receives `loadData`).
 */

// Google Form backend — the form ID + entry.* field IDs come from the form's
// "Get pre-filled link". These are not secrets: the form accepts anonymous
// submissions by design.
const FEEDBACK_FORM_ACTION = 'https://docs.google.com/forms/d/e/1FAIpQLSeP98-QmARW8U5AxMhB8ao8VRrCRsXIJCnTlgY-q59glC0LIw/formResponse';
const FEEDBACK_ENTRY = {
    type:        'entry.1413619499',
    message:     'entry.1277274355',
    email:       'entry.2082989449',
    diagnostics: 'entry.686937648',
};

/**
 * Wire the feedback button + dialog.
 *
 * @param {() => {mode: string, model: object|null, datasetName: string|null}} getContext
 *        Returns live app state for the diagnostics block.
 */
export function initFeedback(getContext) {
    const feedbackBtn          = document.getElementById('feedbackBtn');
    const feedbackDialog       = document.getElementById('feedbackDialog');
    const feedbackDialogClose  = document.getElementById('feedbackDialogClose');
    const feedbackCancelBtn    = document.getElementById('feedbackCancelBtn');
    const feedbackDoneBtn      = document.getElementById('feedbackDoneBtn');
    const feedbackForm         = document.getElementById('feedbackForm');
    const feedbackType         = document.getElementById('feedbackType');
    const feedbackMessage      = document.getElementById('feedbackMessage');
    const feedbackEmail        = document.getElementById('feedbackEmail');
    const feedbackIncludeDiag  = document.getElementById('feedbackIncludeDiag');
    const feedbackDiagPreview  = document.getElementById('feedbackDiagPreview');
    const feedbackCharCount    = document.getElementById('feedbackCharCount');
    const feedbackError        = document.getElementById('feedbackError');
    const feedbackThanks       = document.getElementById('feedbackThanks');
    const feedbackSendBtn      = document.getElementById('feedbackSendBtn');

    // Collect optional technical context to help triage bug reports.
    function buildFeedbackDiagnostics() {
        const { mode, model, datasetName } = getContext();
        const version = document.querySelector('.branding-version')?.textContent?.trim() ?? 'unknown';
        const network = model
            ? `${model.layers.length} layers · ${model.nodes.length} nodes · ${model.extended.length} links`
            : 'none loaded';
        return {
            appVersion: version,
            mode,
            dataset: datasetName ?? '(user-loaded or none)',
            network,
            url: location.href,
            userAgent: navigator.userAgent,
            screen: `${window.innerWidth}×${window.innerHeight}`,
            timestamp: new Date().toISOString(),
        };
    }

    function refreshFeedbackDiagPreview() {
        feedbackDiagPreview.textContent = JSON.stringify(buildFeedbackDiagnostics(), null, 2);
    }

    function openFeedbackDialog() {
        // Reset to the form view each time it opens.
        feedbackForm.style.display   = '';
        feedbackThanks.style.display = 'none';
        feedbackError.style.display  = 'none';
        refreshFeedbackDiagPreview();
        feedbackDialog.style.display = 'flex';
        feedbackMessage.focus();
    }
    function closeFeedbackDialog() { feedbackDialog.style.display = 'none'; }

    feedbackBtn.addEventListener('click', openFeedbackDialog);
    feedbackDialogClose.addEventListener('click', closeFeedbackDialog);
    feedbackCancelBtn.addEventListener('click', closeFeedbackDialog);
    feedbackDoneBtn.addEventListener('click', closeFeedbackDialog);
    feedbackDialog.addEventListener('click', e => {
        if (e.target === feedbackDialog) closeFeedbackDialog();
    });
    feedbackMessage.addEventListener('input', () => {
        feedbackCharCount.textContent = feedbackMessage.value.trim().length;
    });

    feedbackForm.addEventListener('submit', async e => {
        e.preventDefault();
        const email   = feedbackEmail.value.trim();
        const message = feedbackMessage.value.trim();
        if (!email || !feedbackEmail.checkValidity()) {
            feedbackError.textContent = 'Please enter a valid email address before sending.';
            feedbackError.style.display = '';
            feedbackEmail.focus();
            return;
        }
        if (!message) {
            feedbackError.textContent = 'Please enter a message before sending.';
            feedbackError.style.display = '';
            feedbackMessage.focus();
            return;
        }
        feedbackError.style.display = 'none';

        // Assemble the submission payload.
        const diagnostics = feedbackIncludeDiag.checked ? buildFeedbackDiagnostics() : null;
        const body = new URLSearchParams();
        body.set(FEEDBACK_ENTRY.type,        feedbackType.value);
        body.set(FEEDBACK_ENTRY.message,     message);
        body.set(FEEDBACK_ENTRY.email,       email);
        body.set(FEEDBACK_ENTRY.diagnostics, diagnostics ? JSON.stringify(diagnostics, null, 2) : '');

        feedbackSendBtn.disabled = true;
        feedbackSendBtn.textContent = 'Sending…';
        try {
            // Google Forms doesn't send CORS headers, so this is a fire-and-forget
            // no-cors POST: it reaches Google and records a row, but the opaque
            // response is unreadable — hence the optimistic confirmation below.
            await fetch(FEEDBACK_FORM_ACTION, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });
            feedbackForm.reset();
            feedbackCharCount.textContent = '0';
            feedbackForm.style.display   = 'none';
            feedbackThanks.style.display = '';
        } catch (err) {
            // no-cors only rejects on a network-level failure (offline, blocked).
            console.error('[feedback] submit failed:', err);
            feedbackError.textContent = 'Could not send feedback (network error). Please try again.';
            feedbackError.style.display = '';
        } finally {
            feedbackSendBtn.disabled = false;
            feedbackSendBtn.textContent = 'Send feedback';
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && feedbackDialog.style.display !== 'none') closeFeedbackDialog();
    });
}
