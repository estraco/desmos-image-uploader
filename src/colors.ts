class ColorManager {
    colors: {
        [key: string]: { cs: string, id: string };
    };

    constructor() {
        this.colors = {};
    }

    color(color: { r: number, g: number, b: number }) {
        const colorString = `c_{${Object.keys(this.colors).length + 1}}=\\operatorname{rgb}\\left(${color.r},${color.g},${color.b}\\right)`;

        if (!this.colors[`rgb(${color.r},${color.g},${color.b})`]) {
            this.colors[`rgb(${color.r},${color.g},${color.b})`] = {
                cs: colorString,
                id: `c_{${Object.keys(this.colors).length + 1}}`
            };
        }

        return this.colors[`rgb(${color.r},${color.g},${color.b})`].id;
    }

    getExpressions(startingIndex = 1) {
        return Object.entries(this.colors).map(([, { cs }], index) => ({
            type: 'expression',
            id: index + startingIndex,
            color: '',
            latex: cs
        }));
    }
}

export default ColorManager;
