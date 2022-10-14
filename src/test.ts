import upload from '.';
import fs from 'fs';

const file = fs.readFileSync('img.png');

upload(file, {
    size: 128,
    sizeMultiplier: 1,
    simplify: true
}).then(console.log).catch(e => {
    console.error(e);
});
