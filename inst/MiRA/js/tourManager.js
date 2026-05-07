let _savedOpenSections = [];

const TOUR_STEPS = [
    {
        target: '#sectionData',
        title: 'Step 1 of 6 — Load Your Data',
        body: 'Click <b>Load Example Data</b> and select <b>Vitali et al. 2024 — Canary Islands pollination</b>. It has GPS coordinates, so all 6 visualization modes will be available.',
        placement: 'right',
    },
    {
        target: '#networkCanvas',
        title: 'Step 2 of 6 — Explore the Network',
        body: 'The main canvas shows your multilayer network in 3D. <b>Drag</b> to rotate, <b>scroll</b> to zoom, and <b>click</b> nodes or links for details.',
        placement: 'left',
    },
    {
        targets: ['#sectionLayers', '#sectionNodes', '#sectionLinks', '#sectionSearch'],
        title: 'Step 3 of 6 — Customize Appearance',
        body: 'The sidebar controls node colors, sizes, link styles, layout algorithms, and node search/filter.',
        placement: 'right',
        before() {
            _savedOpenSections = [...document.querySelectorAll('#controlPanels details[open]')].map(d => d.id);
            document.querySelectorAll('#controlPanels details').forEach(d => d.removeAttribute('open'));
        },
        after() {
            _savedOpenSections.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.setAttribute('open', '');
            });
            _savedOpenSections = [];
        },
    },
    {
        target: '#modeBtnsGroup',
        title: 'Step 4 of 6 — Switch Visualization Modes',
        body: 'Choose from 7 modes: <b>Network</b>, <b>Map</b>, <b>Grid</b>, <b>Layer View</b>, <b>Meta-Network</b>, <b>Dashboard</b>, and <b>Data Table</b> — each gives a different perspective on your data.',
        placement: 'bottom',
    },
    {
        target: '#sessionBtnsGroup',
        title: 'Step 5 of 6 — Save & Share',
        body: 'Export your full visualization state as JSON to continue later, or share via a GitHub Gist URL.',
        placement: 'bottom',
    },
    {
        target: '#helpBtn',
        title: 'Step 6 of 6 — Help & Full Manual',
        body: 'Click <b>?</b> anytime for context-sensitive help in the current mode. It also links to the full manual with every feature explained in detail.',
        placement: 'right',
    },
];

const POPOVER_WIDTH = 280;
const GAP = 14;
const HIGHLIGHT_PADDING = 5;

let currentStep = -1;
let keyHandler = null;

const highlight = document.getElementById('tourHighlight');
const popover   = document.getElementById('tourPopover');
const titleEl   = document.getElementById('tourTitle');
const bodyEl    = document.getElementById('tourBody');
const counterEl = document.getElementById('tourCounter');
const prevBtn   = document.getElementById('tourPrev');
const nextBtn   = document.getElementById('tourNext');
const closeBtn  = document.getElementById('tourClose');

// Called by the Tour button — resets to a clean app state, then resumes.
export function startTour() {
    sessionStorage.setItem('tourPending', '1');
    window.location.reload();
}

function _beginTour() {
    showStep(0);
    keyHandler = e => {
        if (e.key === 'Escape')                                                navigate(-1);
        if (e.key === 'ArrowRight' && currentStep < TOUR_STEPS.length - 1)    navigate(currentStep + 1);
        if (e.key === 'ArrowLeft'  && currentStep > 0)                         navigate(currentStep - 1);
    };
    document.addEventListener('keydown', keyHandler);
}

// Auto-resume after reload
if (sessionStorage.getItem('tourPending')) {
    sessionStorage.removeItem('tourPending');
    requestAnimationFrame(_beginTour);
}

function navigate(newIndex) {
    TOUR_STEPS[currentStep]?.after?.();
    if (newIndex === -1) { endTour(); return; }
    showStep(newIndex);
}

function showStep(index) {
    currentStep = index;
    const step = TOUR_STEPS[index];

    step.before?.();

    const rect = getTargetRect(step);
    if (!rect) { endTour(); return; }

    const p = HIGHLIGHT_PADDING;
    highlight.style.cssText = `
        display: block;
        top:    ${rect.top    - p}px;
        left:   ${rect.left   - p}px;
        width:  ${rect.width  + p * 2}px;
        height: ${rect.height + p * 2}px;
    `;

    titleEl.textContent      = step.title;
    bodyEl.innerHTML         = step.body;
    counterEl.textContent    = `${index + 1} / ${TOUR_STEPS.length}`;
    prevBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
    nextBtn.textContent      = index === TOUR_STEPS.length - 1 ? 'Finish ✓' : 'Next →';

    popover.style.display = 'block';
    positionPopover(rect, step.placement);
}

function getTargetRect(step) {
    if (step.targets) {
        const rects = step.targets
            .map(s => document.querySelector(s)?.getBoundingClientRect())
            .filter(Boolean);
        if (!rects.length) return null;
        const top    = Math.min(...rects.map(r => r.top));
        const left   = Math.min(...rects.map(r => r.left));
        const bottom = Math.max(...rects.map(r => r.bottom));
        const right  = Math.max(...rects.map(r => r.right));
        return { top, left, bottom, right, width: right - left, height: bottom - top };
    }
    const el = document.querySelector(step.target);
    return el ? el.getBoundingClientRect() : null;
}

function positionPopover(rect, placement) {
    const p  = HIGHLIGHT_PADDING;
    const pw = POPOVER_WIDTH;
    const ph = popover.offsetHeight || 180;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top, left;

    switch (placement) {
        case 'right':
            left = rect.right  + p + GAP;
            top  = rect.top    + (rect.height - ph) / 2;
            break;
        case 'left':
            left = rect.left   - p - GAP - pw;
            top  = rect.top    + (rect.height - ph) / 2;
            break;
        case 'top':
            left = rect.left   + (rect.width  - pw) / 2;
            top  = rect.top    - p - GAP - ph;
            break;
        default: // bottom
            left = rect.left   + (rect.width  - pw) / 2;
            top  = rect.bottom + p + GAP;
    }

    left = Math.max(8, Math.min(left, vw - pw - 8));
    top  = Math.max(8, Math.min(top,  vh - ph - 8));

    popover.style.top  = `${top}px`;
    popover.style.left = `${left}px`;
}

function endTour() {
    highlight.style.display = 'none';
    popover.style.display   = 'none';
    currentStep = -1;
    if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
        keyHandler = null;
    }
}

prevBtn.addEventListener('click', () => navigate(currentStep - 1));
nextBtn.addEventListener('click', () => {
    if (currentStep < TOUR_STEPS.length - 1) navigate(currentStep + 1);
    else { TOUR_STEPS[currentStep]?.after?.(); endTour(); }
});
closeBtn.addEventListener('click', () => { TOUR_STEPS[currentStep]?.after?.(); endTour(); });
