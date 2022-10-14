import crypto from 'crypto';
import _ from 'lodash';
import RGBA, { RGBAarrType } from 'png-to-rgba';
import sharp from 'sharp';

const fetch: typeof global.fetch = global.fetch || require('node-fetch');

export type ExpressionFormat = {
    type: string;
    id: number;
    color: string;
    latex: string;
    fillOpacity: string;
    lineOpacity: string;
    lineWidth: string;
};

export type CompressedFormat = {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    opacity: number;
}[];

export async function compressImage(image: RGBAarrType): Promise<CompressedFormat> {
    const result: CompressedFormat = [
        {
            color: '#ffffff',
            height: image.length,
            opacity: 255,
            width: image[0].length,
            x: 0,
            y: 0
        }
    ];

    let currentColor: RGBAarrType[0][0] = [0, 0, 0, 0];
    let currentX = 0;
    let currentY = 0;
    let currentWidth = 0;
    let currentHeight = 0;

    // check if the current pixel is the same as the previous one
    function checkPixel(x: number, y: number): boolean {
        return _.isEqual(currentColor, image[y][x]);
    }

    // find the largest rectangle that is filled with the same color
    async function findRectangle(x: number, y: number): Promise<void> {
        let width = 0;
        let height = 0;
        let isSame = true;

        await new Promise<void>((resolve) => {
            const step1 = () => {
                width++;
                if (width >= image[y].length)
                    return resolve();

                for (let i = 0; i < height; i++) {
                    if (!checkPixel(x + width - 1, y + i)) {
                        isSame = false;
                        break;
                    }
                }

                if (isSame) {
                    setImmediate(step1);
                } else {
                    resolve();
                }
            };

            step1();
        });

        isSame = true;

        await new Promise<void>((resolve) => {
            const step2 = () => {
                height++;
                if (height >= image.length)
                    return resolve();
                for (let i = 0; i < width; i++) {
                    if (!checkPixel(x + i, y + height - 1)) {
                        isSame = false;
                        break;
                    }
                }

                if (isSame) {
                    setImmediate(step2);
                } else {
                    resolve();
                }
            };

            step2();
        });

        currentWidth = width;
        currentHeight = height;
    }

    for (let y = 0; y < image.length; y++) {
        for (let x = 0; x < image[y].length; x++) {
            if (checkPixel(x, y)) {
                currentWidth++;
            } else {
                if (currentWidth > 0) {
                    currentWidth = (currentWidth - image[y].length) + 1;
                    if (currentX + currentWidth <= image[y].length)
                        if (
                            currentColor[0] <= 240 &&
                            currentColor[1] <= 240 &&
                            currentColor[2] <= 240 &&
                            currentColor[3] > 17
                        )
                            result.push({
                                x: currentX,
                                y: currentY,
                                width: currentWidth,
                                height: currentHeight,
                                color: `rgb(${currentColor[0]}, ${currentColor[1]}, ${currentColor[2]})`,
                                opacity: currentColor[3]
                            });
                }
                currentColor = image[y][x];
                currentX = x;
                currentY = y;
                currentWidth = 1;
                currentHeight = 1;
                await findRectangle(x, y);
            }
        }
    }

    return result;
}

export function simplifyImage(image: RGBAarrType): RGBAarrType {
    const result: RGBAarrType = [];

    for (let y = 0; y < image.length; y++) {
        result.push([]);

        for (let x = 0; x < image[y].length; x++) {
            // bring colors down to a maximum of 16 values
            const pixel = image[y][x];

            // if (pixel[3] <= 127) {
            //     result[y].push([256, 256, 256, 255]);
            //     continue;
            // }

            // round colors to the nearest 16
            pixel[0] = Math.round(pixel[0] / 16) * 16;
            pixel[1] = Math.round(pixel[1] / 16) * 16;
            pixel[2] = Math.round(pixel[2] / 16) * 16;
            pixel[3] = Math.round(pixel[3] / 16) * 16;

            // max of 255
            pixel[0] = Math.min(pixel[0], 255);
            pixel[1] = Math.min(pixel[1], 255);
            pixel[2] = Math.min(pixel[2], 255);
            pixel[3] = Math.min(pixel[3], 255);

            // min of 0
            pixel[0] = Math.max(pixel[0], 0);
            pixel[1] = Math.max(pixel[1], 0);
            pixel[2] = Math.max(pixel[2], 0);
            pixel[3] = Math.max(pixel[3], 0);

            result[y].push(pixel);
        }
    }

    return result;
}

export function compressedToExpressions(compressed: CompressedFormat, originalHeight: number, sizeMultiplier: number): ExpressionFormat[] {
    const result: ExpressionFormat[] = [];

    for (let i = 0; i < compressed.length; i++) {
        const { color, x, y, width, height } = compressed[i];
        const lineOpacity = '1';
        const fillOpacity = (Math.round((compressed[i].opacity / 255) * 100) / 100).toString();
        const lineWidth = '2';

        const exp = {
            type: 'expression',
            id: i,
            color,
            latex: `${round(x * sizeMultiplier, sizeMultiplier)}\\le x\\le${round((x + width) * sizeMultiplier, sizeMultiplier)}\\left\\{${round((originalHeight - y - height) * sizeMultiplier, sizeMultiplier)}\\le y\\le${round((originalHeight - y) * sizeMultiplier, sizeMultiplier)}\\right\\}`,
            fillOpacity,
            lineOpacity,
            lineWidth
        };

        result.push(exp);
    }

    return result;
}

export function RGBAarrTypeToExpressions(image: RGBAarrType): ExpressionFormat[] {
    const result: ExpressionFormat[] = [];

    for (let y = 0; y < image.length; y++) {
        for (let x = 0; x < image[y].length; x++) {
            const pixel = image[y][x];
            const lineOpacity = '1';
            const fillOpacity = (Math.round((pixel[3] / 255) * 100) / 100).toString();
            const lineWidth = '2';

            const exp = {
                type: 'expression',
                id: result.length,
                color: `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`,
                latex: `${y}\\le x\\le${y + 1}\\left\\{${x}\\le y\\le${x + 1}\\right\\}`,
                fillOpacity,
                lineOpacity,
                lineWidth
            };

            result.push(exp);
        }
    }

    return result;
}

export function copyArray(input: RGBAarrType) {
    const result = [];
    for (const row of input) {
        result.push(row.slice());
    }
    return result;
}

export function findVerticalRect(input: RGBAarrType, x: number, y: number, width: number) {
    const value = input[y][x];
    let height = 0;

    if (x + width > input[y].length) {
        return 0;
    }

    while (y + height < input.length) {
        for (let i = 0; i < width; i++) {
            if (!_.isEqual(input[y + height][x + i], value)) {
                return height;
            }
        }
        height++;
    }
    return height;
}

export function findHorizontalRect(input: RGBAarrType, x: number, y: number, height: number) {
    const value = input[y][x];
    let width = 0;

    if (y + height > input.length) {
        return 0;
    }

    while (x + width < input[y].length) {
        for (let i = 0; i < height; i++) {
            if (!_.isEqual(input[y + i][x + width], value)) {
                return width;
            }
        }
        width++;
    }

    return width;
}

export function combine(_input: RGBAarrType) {
    const input = copyArray(_input);

    const result: { x: number, y: number, width: number, height: number, value: [number, number, number, number] }[] = [];

    for (let y = 0; y < input.length; y++) {
        for (let x = 0; x < input[y].length; x++) {
            const value = input[y][x];
            if (value === null) {
                continue;
            }

            let width = 0;

            while (width + x < input[y].length) {
                const height = findVerticalRect(input, x, y, width + 1);

                if (height === 0) {
                    break;
                }

                for (let i = 0; i < height; i++) {
                    const w = findHorizontalRect(input, x, y + i, height);

                    if (w === 0) {
                        break;
                    }

                    if (w > width) {
                        width = w;
                    }
                }

                if (width === 0) {
                    break;
                }

                result.push({
                    x,
                    y,
                    width,
                    height,
                    value
                });

                for (let i = 0; i < height; i++) {
                    for (let j = 0; j < width; j++) {
                        input[y + i][x + j] = null;
                    }
                }

                x += width - 1;
                break;
            }
        }
    }

    return result;
}

export function combinationCompressionToExpressions(original: RGBAarrType, sizeMultiplier: number) {
    const compressed = combine(original);
    const result: ExpressionFormat[] = [
        {
            type: 'expression',
            id: 0,
            color: 'rgb(255, 255, 255)',
            latex: `0\\le x\\le${original[0].length * sizeMultiplier}\\left\\{0\\le y\\le${original.length * sizeMultiplier}\\right\\}`,
            fillOpacity: '1',
            lineOpacity: '1',
            lineWidth: '2'
        }
    ];

    for (let i = 0; i < compressed.length; i++) {
        const { value, x, y, width, height } = compressed[i];

        if (value.every(v => v === 255)) {
            continue;
        }

        const lineOpacity = '1';
        const fillOpacity = (Math.round((value[3] / 255) * 100) / 100).toString();
        const lineWidth = '2';

        const exp = {
            type: 'expression',
            id: i + 1,
            color: `rgb(${value[0]}, ${value[1]}, ${value[2]})`,
            latex: `${round(x * sizeMultiplier, sizeMultiplier)}\\le x\\le${round((x + width) * sizeMultiplier, sizeMultiplier)}\\left\\{${round((original.length - y) * sizeMultiplier, sizeMultiplier)}\\le y\\le${round((original.length - (y + height)) * sizeMultiplier, sizeMultiplier)}\\right\\}`,
            fillOpacity,
            lineOpacity,
            lineWidth
        };

        result.push(exp);
    }

    return result;
}

export function toDataURL(data: Buffer) {
    return `data:image/png;base64,${data.toString('base64')}`;
}

export function genStr(len: number) {
    let result = '';
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < len; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

export async function uploadRaw(expressions: ExpressionFormat[], image: Buffer, name: string = genStr(10)) {
    const params = new URLSearchParams();

    params.append('thumb_data', toDataURL(image));
    const data = {
        calc_state: JSON.stringify({
            version: 9,
            randomSeed: crypto.randomBytes(16).toString('hex'),
            graph: {
                viewport: {
                    xmin: -100,
                    ymin: -170.8882725832012,
                    xmax: 100,
                    ymax: 170.8882725832012
                }
            },
            expressions: {
                list: expressions
            }
        }),
        is_update: 'false',
        lang: 'en',
        my_graphs: 'false',
        graph_hash: name
    };

    for (const key in data) {
        params.append(key, data[key as keyof typeof data]);
    }

    return fetch('https://www.desmos.com/api/v1/calculator/save', {
        headers: {
            accept: 'application/json, text/javascript, */*; q=0.01',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'no-cache',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            pragma: 'no-cache',
            'sec-ch-ua': '"Opera GX";v="81", " Not;A Brand";v="99", "Chromium";v="95"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'x-requested-with': 'XMLHttpRequest',
            Referer: 'https://www.desmos.com/calculator',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        },
        body: params.toString(),
        method: 'POST'
    })
        .then(async res => {
            const text = await res.text();

            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('failed to parse json');
            }
        })
        .then(res => {
            res.url = `https://desmos.com/calculator/${res.hash}`;
            res.length = params.toString().length;

            return res;
        });
}

function round(num: number, base: number) {
    return Math.round(num * (1 / base)) / (1 / base);
}

async function uploadImage(image: Buffer, opt: Partial<{
    sizeMultiplier: number;
    name: string;
    size: number;
}> = {}) {
    const trimmed = await sharp(image)
        .resize({
            width: opt.size,
            height: opt.size,
            fit: 'contain',
            position: 'left bottom'
        })
        .flatten({
            background: {
                r: 255,
                g: 255,
                b: 255
            }
        })
        .trim()
        .toBuffer({
            resolveWithObject: true
        });

    console.log(trimmed.info);

    const resized = await sharp(trimmed.data)
        .extract({
            height: trimmed.info.height,
            width: trimmed.info.width + trimmed.info.trimOffsetLeft,
            left: 0,
            top: 0
        })
        .toBuffer();

    const { rgba } = RGBA.PNGToRGBAArray(resized);

    const simplifiedImage = simplifyImage(rgba);

    // const compressedImage = await compressImage(simplifiedImage);

    // const expressions = compressedToExpressions(compressedImage, height, opt.sizeMultiplier || 0.1);

    const expressions = combinationCompressionToExpressions(simplifiedImage, opt.sizeMultiplier || 0.1);

    const result = await uploadRaw(expressions, resized, opt.name);

    return result;
}

export default uploadImage;
