/**
 * colorMapper.js — Maps values to colors using categorical or numeric palettes
 */

// ColorBrewer Dark2 — qualitative palette, colorblind-safe, scientific standard
// Accessed via globalThis so it works both in the browser (window.chroma) and in the test env
const getCategoricalPalette = () => globalThis.chroma.brewer.Dark2;

// Layer palette — single purple used for all layers by default
const LAYER_FILL_DEFAULT  = 'rgba(139, 92, 246, 0.18)';
const LAYER_BORDER_DEFAULT = 'rgba(139, 92, 246, 0.55)';
const NODE_LAYER_COLOR_DEFAULT = '#a78bfa';

// Bipartite set colors (matching stabilitygame.html plant/pollinator palette)
export const BIPARTITE_SET_A_COLOR = '#0072b2'; // blue (Set A)
export const BIPARTITE_SET_B_COLOR = '#f472b6'; // pink (pollinators)

export class ColorMapper {
    constructor() {
        this.categoryMaps = new Map(); // attrName -> Map(value -> color)
    }

    /**
     * Get a color for a layer (background fill) — default purple for all layers
     */
    getLayerFill() {
        return LAYER_FILL_DEFAULT;
    }

    getLayerBorder() {
        return LAYER_BORDER_DEFAULT;
    }

    getNodeLayerColor() {
        return NODE_LAYER_COLOR_DEFAULT;
    }

    /**
     * Get node color for bipartite set membership
     */
    getBipartiteNodeColor(isSetA) {
        return isSetA ? BIPARTITE_SET_A_COLOR : BIPARTITE_SET_B_COLOR;
    }

    /**
     * Build a color mapping for a given attribute across a collection of items.
     * Returns a function: value -> color
     */
    buildColorScale(items, attrName, forceType = null) {
        const values = items.map(item => item[attrName]).filter(v => v !== undefined && v !== null);
        const uniqueValues = [...new Set(values)].sort((a, b) => {
            const na = Number(a), nb = Number(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return String(a).localeCompare(String(b));
        });

        // Check if numeric. We allow numbers and string-represented numbers (excluding pure whitespace).
        const allNumeric = values.length > 0 && values.every(v =>
            (typeof v === 'number' && !isNaN(v)) || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))
        );

        let useContinuous;
        const warnings = [];
        if (forceType === 'continuous' && allNumeric) {
            useContinuous = true;
        } else if (forceType === 'continuous' && !allNumeric) {
            warnings.push(`forceType='continuous' requested for "${attrName}" but data is not numeric — falling back to categorical`);
            useContinuous = false;
        } else if (forceType === 'categorical') {
            useContinuous = false;
        } else {
            // Treat as continuous if all values are numeric, AND (there are more than 2 unique values, 
            // OR it matches common continuous attribute names)
            const isContinuousName = /weight|abundance|degree|strength|mass|size|value/i.test(attrName);
            useContinuous = allNumeric && (uniqueValues.length > 2 || isContinuousName);
        }

        const canToggle = allNumeric; // We only allow toggling if the variable could theoretically be mapped continuously

        if (useContinuous) {
            // Numeric gradient
            const nums = values.map(Number);
            const min = Math.min(...nums);
            const max = Math.max(...nums);
            const range = max - min || 1;

            const scaleFn = (value) => {
                if (value === undefined || value === null) return '#6b7280';
                const t = (Number(value) - min) / range;
                return globalThis.chroma.scale('Viridis')(t).hex();
            };
            return { type: 'continuous', min, max, attrName, scaleFn, canToggle, warnings };
        } else {
            // Categorical
            const colorMap = new Map();
            uniqueValues.forEach((val, i) => {
                colorMap.set(val, getCategoricalPalette()[i % getCategoricalPalette().length]);
            });

            const scaleFn = (value) => {
                if (value === undefined || value === null) return '#6b7280';
                return colorMap.get(value) || '#6b7280';
            };
            return { type: 'categorical', map: colorMap, attrName, scaleFn, canToggle, warnings };
        }
    }
}


export const defaultColorMapper = new ColorMapper();
