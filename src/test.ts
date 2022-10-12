import upload from '.';
import fs from 'fs';

const file = fs.readFileSync('img.png');

upload(file, {
    size: 100,
    sizeMultiplier: 2
}).then(console.log).catch(console.error);
