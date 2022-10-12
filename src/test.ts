import upload from '.';
import fs from 'fs';

const file = fs.readFileSync('img.png');

upload(file, {
    size: 400,
    sizeMultiplier: 0.1
}).then(console.log).catch(console.error);
