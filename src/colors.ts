class ColorManager {
    colors: {
        [key: string]: string;
    };

    constructor() {
        this.colors = {};
    }

    color(color: { r: number, g: number, b: number }) {
        const colorString = `c_{${Object.keys(this.colors).length + 1}}=\\operatorname{rgb}\\left(${color.r},${color.g},${color.b}\\right)`;

        if (!this.colors[colorString]) {
            this.colors[colorString] = `c_{${Object.keys(this.colors).length + 1}}`;
        }

        return this.colors[colorString];
    }

    getExpressions(startingIndex = 1) {
        return Object.keys(this.colors).map((color, index) => ({
            type: 'expression',
            id: index + startingIndex,
            color: '',
            latex: color
        }));
    }
}

export default ColorManager;
