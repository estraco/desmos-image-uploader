import fs from 'fs';
import RGBA, { RGBAarrType } from 'png-to-rgba';
import sharp from 'sharp';
import _ from 'lodash';
import crypto from 'crypto';

const fetch: typeof global.fetch = global.fetch || require('node-fetch');

const log = fs.createWriteStream('log.txt');

type ExpressionFormat = {
    type: string;
    id: number;
    color: string;
    latex: string;
    fillOpacity: string;
    lineOpacity: string;
    lineWidth: string;
};

type CompressedFormat = {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
}[];

async function compressImage(image: RGBAarrType): Promise<CompressedFormat> {
    const result: {
        x: number;
        y: number;
        width: number;
        height: number;
        color: string;
    }[] = [];

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
                    if (currentColor[3] === 255) {
                        currentWidth = (currentWidth - image[y].length) + 1;
                        console.log(`found rectangle at ${currentX} ${currentY} with width ${currentWidth} and height ${currentHeight}`);
                        log.write(`found rectangle at ${currentX} ${currentY} with width ${currentWidth} and height ${currentHeight}\n`);
                        if (currentX + currentWidth <= image[y].length)
                            result.push({
                                x: currentX,
                                y: currentY,
                                width: currentWidth,
                                height: currentHeight,
                                color: `rgb(${currentColor[0]}, ${currentColor[1]}, ${currentColor[2]})`
                            });
                    }
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

function simplifyImage(image: RGBAarrType): RGBAarrType {
    const result: RGBAarrType = [];

    for (let y = 0; y < image.length; y++) {
        result.push([]);

        for (let x = 0; x < image[y].length; x++) {
            // bring colors down to a maximum of 16 values
            const pixel = image[y][x];

            pixel[3] = pixel[3] > 127 ? 255 : 0;

            if (pixel[3] !== 255) {
                result[y].push([0, 0, 0, 0]);
                continue;
            }

            result[y].push(pixel);
        }
    }

    return result;
}

function compressedToExpressions(compressed: CompressedFormat, originalHeight: number, sizeMultiplier: number): ExpressionFormat[] {
    const result: ExpressionFormat[] = [];

    for (let i = 0; i < compressed.length; i++) {
        const { color, x, y, width, height } = compressed[i];
        const fillOpacity = '1';
        const lineOpacity = '1';
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

function toDataURL(data: Buffer) {
    return `data:image/png;base64,${data.toString('base64')}`;
}

function genStr(len: number) {
    let result = '';
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < len; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

async function upload(expressions: ExpressionFormat[], image: Buffer, name: string = genStr(10)) {
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

    console.log(`Sending #bytes ${params.toString().length}`);

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
                console.log('failed to parse json');
                console.log(text);

                process.exit(1);
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

const image = fs.readFileSync('img.png');

const size = 200;

sharp(image)
    .resize({
        width: size,
        height: size,
        fit: 'contain',
        position: 'left bottom',
        background: {
            r: 0,
            g: 0,
            b: 0,
            alpha: 0
        }
    })
    .flatten()
    .toBuffer()
    .then(async resized => {
        const { rgba, height } = RGBA.PNGToRGBAArray(resized);

        const simplifiedImage = simplifyImage(rgba);

        fs.writeFileSync('simplified.png', RGBA.RGBAArrayToPNG(simplifiedImage));

        const compressedImage = await compressImage(simplifiedImage);

        const expressions = compressedToExpressions(compressedImage, height, 0.5);

        fs.writeFileSync('expressions.json', JSON.stringify(expressions, null, 4));

        const result = await upload(expressions, resized);

        console.log(result);

        process.exit(0);
    });