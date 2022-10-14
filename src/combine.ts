import fs from 'fs';
import rgba from 'png-to-rgba';
import { combine } from '.';

const input = rgba.PNGToRGBAArray(fs.readFileSync('img.png')).rgba;

const result = combine(input);

console.log(JSON.stringify(result).length);
