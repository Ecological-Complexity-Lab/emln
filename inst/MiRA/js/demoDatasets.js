/**
 * demoDatasets.js — Built-in example datasets: metadata, dialog wiring, loader.
 *
 * Owns the "Load Example" UI subsystem in its entirety:
 *   - The DATASET_INFO metadata table (name, citations, DOIs, attribute lists).
 *   - The two-view dialog (list view + per-dataset info view) and its buttons.
 *   - Building the rows in the list view.
 *   - Fetching the JSON file and handing it off to loadData().
 *
 * Exports:
 *   - DATASET_INFO          — read-only metadata (exported for completeness)
 *   - initDemoDatasets(loadData)
 *                           — wires every listener and builds the list. Call
 *                             once during app init, passing the loadData
 *                             function from app.js as the JSON handler.
 */

// Domain pill colors — button tints live in style.css (.btn-domain-*).
const DOMAIN_PILL_STYLES = {
    'Ecology':              'background:rgba(34,197,94,0.18); border:1px solid rgba(34,197,94,0.35); color:#166534;',
    'Microbiology':         'background:rgba(6,182,212,0.18); border:1px solid rgba(6,182,212,0.35); color:#0e7490;',
    'Biomedicine':          'background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.32); color:#be123c;',
    'Neuroscience':         'background:rgba(139,92,246,0.18); border:1px solid rgba(139,92,246,0.35); color:#6d28d9;',
    'Population genetics':  'background:rgba(245,158,11,0.16); border:1px solid rgba(245,158,11,0.33); color:#b45309;',
    'Molecular Biology':    'background:rgba(235,52,210,0.15); border:1px solid rgba(235,52,210,0.32); color:#9b1599;',
};

// Multilayer-type pill — uniform gray regardless of type.
const ML_TYPE_PILL_STYLE = 'background:rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.12); color:#666;';

export const DATASET_INFO = {
    vitali2024: {
        domain: 'Ecology',
        mlType: 'spatial',
        name: 'Canary Islands pollination network',
        citation: 'Vitali et al. 2024',
        doi: 'https://doi.org/10.1111/1365-2656.14174',
        dataDoi: 'https://doi.org/10.5061/dryad.76173',
        layers: '5 layers — Fuerteventura, Gran Canaria, Tenerife, Gomera, Hierro',
        nodes: '235 species (34 plants · 201 pollinators)',
        links: '651 intralayer (plant–pollinator visits) + 154 interlayer (Jaccard similarity of interaction partners)',
        network: 'Undirected · bipartite per layer · GPS coordinates (map mode)',
        nodeAttrs: ['node_type (plant / pollinator)', 'module (1–33, Infomap)'],
        linkAttrs: ['weight'],
    },
    pilosof2017: {
        domain: 'Ecology',
        mlType: 'temporal',
        name: 'Siberian host–parasite network',
        citation: 'Pilosof et al. 2017',
        doi: 'https://doi.org/10.1038/s41559-017-0101',
        dataDoi: 'https://doi.org/10.1038/s41559-017-0101',
        dataLabel: 'Data available in Pilosof et al. 2017 but were originally used in Krasnov et al. 2009:',
        layers: '6 temporal layers — 1982–1987',
        nodes: '78 species (22 hosts · 56 parasites)',
        links: '1,817 intralayer (host–parasite interactions) + 284 directed interlayer (species persistence year → year+1)',
        network: 'Undirected intralayer · directed interlayer · bipartite per layer',
        nodeAttrs: ['node_type (host / parasite)', 'abundance', 'module (1–7, Infomap)'],
        linkAttrs: ['weight'],
    },
    magrach2020: {
        domain: 'Ecology',
        mlType: 'spatial',
        name: 'Basque Country spatial pollination network',
        citation: 'Magrach et al. (EuPPollNet)',
        doi: 'https://doi.org/10.1111/geb.70000',
        dataDoi: 'https://github.com/JoseBSL/EuPPollNet',
        layers: '5 layers — grassland sites, Orozko, Basque Country (Spain)',
        nodes: '137 species (45 plants · 92 pollinators)',
        links: '376 intralayer (plant–pollinator visits) + 142 interlayer (Jaccard similarity of interaction partners)',
        network: 'Undirected · bipartite per layer · GPS coordinates (map mode)',
        nodeAttrs: ['node_type (plant / pollinator)'],
        linkAttrs: ['weight'],
    },
    costa2020: {
        domain: 'Ecology',
        mlType: 'temporal',
        name: 'Portuguese temporal seed dispersal network',
        citation: 'Costa et al. 2020',
        doi: 'https://doi.org/10.1111/1365-2745.13391',
        dataDoi: 'https://doi.org/10.6084/m9.figshare.11985912',
        layers: '5 layers — 2012–2016 (annual)',
        nodes: '29 species (17 plants · 12 birds)',
        links: '170 intralayer (seed dispersal interactions) + 43 directed interlayer (species persistence year → year+1)',
        network: 'Undirected intralayer · directed interlayer · bipartite per layer',
        nodeAttrs: ['node_type (plant / bird)', 'group (resident / partial-migratory)', 'versatility', 'degree', 'strength', 'd_specialisation', 'n_years'],
        linkAttrs: ['weight (seed count)'],
    },
    larremore2013_malaria: {
        domain: 'Population genetics',
        mlType: 'multiplex',
        name: 'P. falciparum var gene recombination network',
        citation: 'Larremore et al. 2013',
        doi: 'https://doi.org/10.1371/journal.pcbi.1003268',
        dataDoi: 'https://github.com/dblarremore/data_malaria_PLOSCompBiology_2013',
        layers: '9 layers — highly variable regions (HVR 1–9) of the DBLα domain of PfEMP1',
        nodes: '307 P. falciparum var genes (from 7 parasite isolates)',
        links: '35,306 intralayer (statistically significant shared sequence substrings, per HVR)',
        network: 'Undirected · multiplex · sequence-similarity network · CC-BY',
        nodeAttrs: ['UPS — upstream promoter type (A / B / C / ND)', 'CysPoLV — cysteine/PoLV group (1–6)'],
        linkAttrs: ['(unweighted — edge indicates a shared recombinant sequence block)'],
    },
    diseasome_multiplex: {
        domain: 'Biomedicine',
        mlType: 'multiplex',
        name: 'Human disease multiplex network',
        citation: 'Halu et al. 2019',
        doi: 'https://doi.org/10.1038/s41540-019-0092-5',
        dataDoi: 'https://github.com/manlius/MultiplexDiseasome',
        dataLabel: 'Data (MultiplexDiseasome):',
        layers: '2 layers — Genotype (shared disease genes), Phenotype (shared clinical symptoms)',
        nodes: '478 diseases (across both layers)',
        links: '2,098 intralayer (diseases sharing genes or symptoms, per layer) + 199 interlayer (artificial diagonal coupling — same disease across both layers)',
        network: 'Undirected · multiplex · built from OMIM + GWAS data',
        nodeAttrs: ['n_genes (genotype layer)', 'n_symptoms (phenotype layer)'],
        linkAttrs: ['weight (number of shared genes / symptoms)'],
        license: 'Open Database License (ODbL 1.0)',
        licenseUrl: 'https://opendatacommons.org/licenses/odbl/1.0/',
    },
    keresztes2022_connectome: {
        domain: 'Neuroscience',
        mlType: 'temporal',
        name: 'Human brain structural connectome',
        citation: 'Keresztes et al. 2022',
        doi: 'https://doi.org/10.1038/s41598-022-06697-4',
        dataDoi: 'https://braingraph.org/download-pit-group-connectomes/',
        dataLabel: 'Data (braingraph.org):',
        layers: '3 layers — longitudinal MRI sessions (T1, T2, T3) of one participant (OASIS-3)',
        nodes: '124 brain regions (Lausanne 2018 atlas, scale 1)',
        links: '~600 intralayer (white-matter tracts, >50 fibers) + 220 interlayer (diagonal coupling, weight = Pearson r of fiber profiles across sessions)',
        network: 'Undirected · multiplex · structural connectome · CC-BY 4.0',
        nodeAttrs: ['hemisphere (left / right)', 'region (cortical / subcortical)'],
        linkAttrs: ['number_of_fibers', 'fiber_length_mean (mm)', 'fiber_density', 'normalized_fiber_density'],
    },
    shemesh2021_chaperones: {
        domain: 'Molecular Biology',
        mlType: 'multiplex',
        name: 'Human chaperone co-expression network',
        citation: 'Shemesh et al. 2021',
        doi: 'https://doi.org/10.1038/s41467-021-22369-9',
        dataDoi: 'https://doi.org/10.1038/s41467-021-22369-9',
        dataLabel: 'Supplementary data (Nature Communications):',
        layers: '8 layers — Whole Blood, Brain, Heart, Liver, Skeletal Muscle, Lung, Testis, Skin',
        nodes: '50 hub chaperone proteins (top-degree across all tissues)',
        links: '6,640 intralayer co-expression edges (|r| > 0.4, p < 0.01) + 1,400 interlayer (Jaccard similarity of co-expression partners)',
        network: 'Undirected · multiplex · GTEx co-expression · chaperone proteome subset',
        nodeAttrs: ['family (HSP40 / HSP70 / HSP90 / HSP60 / coHSP90 / NEF / Prefoldin / other)', 'core_variable (Core / Variable)', 'stress (stress-inducible Yes / No)'],
        linkAttrs: ['weight (absolute Pearson r for intralayer; Jaccard similarity of co-expression partners for interlayer)'],
    },

    // ---- Benchmark / stress-test datasets ----
    shapiro2023_plasmids: {
        domain: 'Microbiology',
        mlType: 'multiplex',
        name: 'Plasmid genetic-similarity network in dairy cows',
        citation: 'Shapiro et al. 2023',
        doi: 'https://doi.org/10.1038/s41396-023-01373-5',
        dataDoi: 'https://github.com/Ecological-Complexity-Lab/Plasmid_multilayer_networks',
        layers: '15 layers — dairy cows with ≥ 20 plasmids (Israeli Holstein population, single farm)',
        nodes: '1,344 unique plasmids · 1,471 state nodes (rumen plasmidome)',
        links: '101 intralayer + 2,384 interlayer (genetic similarity ≥ 0.16)',
        network: 'Undirected · multiplex · genetic-similarity network · benchmark for super-spreader / AMR analysis',
        nodeAttrs: ['length_bp', 'amr_class (beta-lactam / tetracycline / penicillin-binding / none)', 'has_mob (mobility / relaxase)', 'n_cows'],
        linkAttrs: ['weight (genetic similarity)', 'align_length (bp of alignment overlap)', 'pident (%)', 'mechanism (pHGT / distant_dispersal / recent_dispersal)'],
    },
    ohmnet_6tissue: {
        hidden: true,
        domain: 'Genomics',
        mlType: 'multiplex',
        name: 'Human tissue PPI — OhmNet ⚡ large',
        citation: 'Zitnik & Leskovec 2017',
        doi: 'https://doi.org/10.1093/bioinformatics/btx252',
        dataDoi: 'https://snap.stanford.edu/ohmnet/',
        layers: '6 layers — Brain, Blood, Kidney, Lung, Heart, Liver',
        nodes: '2,141 hub proteins (≥75 interactions in ≥1 tissue, present in ≥2 tissues)',
        links: '65,581 intralayer PPI edges',
        network: 'Undirected · multiplex · tissue-specific subset of STRING v10 · stress-test dataset',
        nodeAttrs: ['(none — proteins identified by Entrez gene ID)'],
        linkAttrs: ['weight (binary)'],
    },
};

/**
 * Wire the "Load Example" dialog and build the dataset list.
 *
 * @param {(json: object) => void} loadData  The JSON handler from app.js.
 *                                           Called with the fetched dataset JSON.
 */
export function initDemoDatasets(loadData) {
    const demoDialog         = document.getElementById('demoDialog');
    const openDemoDialogBtn  = document.getElementById('openDemoDialogBtn');
    const demoCancelBtn      = document.getElementById('demoCancelBtn');
    const demoListView       = document.getElementById('demoListView');
    const demoInfoView       = document.getElementById('demoInfoView');
    const demoBackBtn        = document.getElementById('demoBackBtn');
    const demoInfoLoadBtn    = document.getElementById('demoInfoLoadBtn');
    const demoDatasetList    = document.getElementById('demoDatasetList');

    // ---- Dialog open/close ----
    openDemoDialogBtn.addEventListener('click', () => {
        demoDialog.style.display = 'flex';
    });
    demoCancelBtn.addEventListener('click', () => {
        demoDialog.style.display = 'none';
    });
    demoDialog.addEventListener('click', (e) => {
        if (e.target === demoDialog) demoDialog.style.display = 'none';
    });

    // ---- Build one row (load button + info button) for a dataset ----
    function buildDatasetRow(file) {
        const info        = DATASET_INFO[file];
        const domainClass = `btn-domain-${(info.domain ?? 'ecology').toLowerCase().replace(/\s+/g, '-')}`;
        const domainPill  = DOMAIN_PILL_STYLES[info.domain] ?? DOMAIN_PILL_STYLES['Ecology'];

        const PILL_BASE = 'border-radius:10px; font-size:9px; font-weight:600; padding:1px 6px; letter-spacing:0.3px; white-space:nowrap; flex-shrink:0;';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:6px;';

        const loadBtn = document.createElement('button');
        loadBtn.className    = `btn ${domainClass}`;
        loadBtn.style.cssText = 'flex:1; text-align:left; padding:7px 10px; line-height:1.3;';
        loadBtn.innerHTML = `
            <span style="display:flex; align-items:baseline; width:100%; gap:6px; margin-bottom:2px;">
                <span style="flex:1; min-width:0; font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${info.name}</span>
                <span style="${domainPill} ${PILL_BASE}">${info.domain}</span>
            </span>
            <span style="display:flex; align-items:baseline; width:100%; gap:6px;">
                <span style="flex:1; min-width:0; font-size:10px; font-weight:400; opacity:0.8;">${info.citation}</span>
                <span style="${ML_TYPE_PILL_STYLE} ${PILL_BASE}">${info.mlType}</span>
            </span>`;
        loadBtn.addEventListener('click', () => loadDemoFile(file));

        const infoBtn = document.createElement('button');
        infoBtn.className     = 'btn demo-info-btn';
        infoBtn.style.cssText = 'flex-shrink:0; width:28px; height:28px; padding:0; font-size:13px;';
        infoBtn.textContent   = 'ⓘ';
        infoBtn.title         = 'More info';
        infoBtn.addEventListener('click', () => showDemoInfo(file));

        row.appendChild(loadBtn);
        row.appendChild(infoBtn);
        return row;
    }

    // ---- Render the info view for a specific dataset ----
    function showDemoInfo(file) {
        const info = DATASET_INFO[file];
        document.getElementById('demoInfoName').textContent     = info.name;
        document.getElementById('demoInfoCitation').textContent = info.citation;

        const nodeAttrList = info.nodeAttrs.map(a => `<li>${a}</li>`).join('');
        const linkAttrList = info.linkAttrs.map(a => `<li>${a}</li>`).join('');
        const doiLink      = `<a href="${info.doi}" target="_blank" rel="noopener" style="color:#5b6af0;">${info.doi}</a>`;
        const dataLabel    = info.dataLabel || 'Data:';
        const dataDoiLine  = info.dataDoi
            ? `<div><strong>${dataLabel}</strong> <a href="${info.dataDoi}" target="_blank" rel="noopener" style="color:#5b6af0;">${info.dataDoi}</a></div>`
            : `<div style="color:#aaa;"><strong>Data source:</strong> see paper</div>`;
        const licenseLine  = info.license
            ? `<div style="margin-top:8px; font-size:11px; color:#777;"><strong>License:</strong> <a href="${info.licenseUrl}" target="_blank" rel="noopener" style="color:#777;">${info.license}</a></div>`
            : '';

        document.getElementById('demoInfoContent').innerHTML = `
            <div style="margin-bottom:8px;"><strong>Layers:</strong> ${info.layers}</div>
            <div style="margin-bottom:8px;"><strong>Nodes:</strong> ${info.nodes}</div>
            <div style="margin-bottom:8px;"><strong>Links:</strong> ${info.links}</div>
            <div style="margin-bottom:12px;"><strong>Network type:</strong> ${info.network}</div>
            <div style="margin-bottom:4px;"><strong>Node attributes:</strong></div>
            <ul style="margin:0 0 8px; padding-left:16px;">${nodeAttrList}</ul>
            <div style="margin-bottom:4px;"><strong>Link attributes:</strong></div>
            <ul style="margin:0 0 12px; padding-left:16px;">${linkAttrList}</ul>
            <div><strong>Paper:</strong> ${doiLink}</div>
            ${dataDoiLine}
            ${licenseLine}
        `;

        demoInfoLoadBtn.dataset.file = file;
        demoListView.style.display   = 'none';
        demoInfoView.style.display   = '';
    }

    demoBackBtn.addEventListener('click', () => {
        demoInfoView.style.display = 'none';
        demoListView.style.display = '';
    });

    demoInfoLoadBtn.addEventListener('click', () => {
        const file = demoInfoLoadBtn.dataset.file;
        loadDemoFile(file);
    });

    // ---- Fetch the JSON file and hand it off to loadData() ----
    async function loadDemoFile(file) {
        demoDialog.style.display     = 'none';
        demoInfoView.style.display   = 'none';
        demoListView.style.display   = '';
        try {
            const resp = await fetch(`data/${file}.json`);
            if (!resp.ok) throw new Error('Failed to fetch demo data');
            const json = await resp.json();
            loadData(json);
        } catch (err) {
            console.error(err);
            alert('Failed to load demo data. Make sure to serve using a local server.');
        }
    }

    // ---- Build list view on load ----
    Object.keys(DATASET_INFO).forEach(file => {
        if (!DATASET_INFO[file].hidden) demoDatasetList.appendChild(buildDatasetRow(file));
    });
}
