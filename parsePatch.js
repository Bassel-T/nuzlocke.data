function capitalizeFirstOnly(str) {
    const words = str.split('-');
    if (words.length === 0) return '';
    return words[0][0].toUpperCase() + words[0].slice(1).toLowerCase() + 
           (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
  }

const fs = require('fs');
const path = require('path');

const parentDir = __dirname + "\\..";

const dir = `${parentDir}\\nuzlocke.data`;
const patchesDir = path.join(dir, 'patches');
const patchFiles = fs.readdirSync(patchesDir).filter(f => f.endsWith('.txt') || f.endsWith('.league'));

const patchOutput = {};

for (const file of patchFiles) {
    const fullPath = path.join(patchesDir, file);
    const baseName = path.basename(file, path.extname(file));
    const content = fs.readFileSync(fullPath, 'utf-8');

    const lines = content.split('\n');
    const result = { ability: {}, item: {}, move: {}, pokemon: {}, fakemon: {}};
    let currentSection = null;
    let currentArray = [];

    for (let line of lines) {
        line = line.trim();

        if (line.startsWith('#')) continue;

        if (line.startsWith('--')) {
            if (currentSection && currentArray.length > 0) {
                result[currentSection] = currentArray;
            }
            currentSection = line.slice(2).trim(); // e.g., "item"
            currentArray = [];
        } else if (line === '') {
            if (currentSection && currentArray.length > 0) {
                result[currentSection] = currentArray;
                currentSection = null;
                currentArray = [];
            }
        } else if (currentSection) {
            const parts = line.split('|');

            switch (currentSection) {
                case 'item': {
                    const [name, sprite, description] = parts;
                    const formattedName = name[0].toLocaleUpperCase() + name.slice(1).replaceAll('-', ' ');

                    result.item[name] = {
                        name: formattedName,
                        sprite: sprite?.trim(),
                        effect: description?.trim()
                    };
                    break;
                }

                case 'move': {
                    const [name, type, power, description, category, locale] = parts;
                    result.move[name?.trim()] = {
                        ...(power ? { power: power.trim() } : {}),
                        ...(type ? { type: type.trim() } : {}),
                        ...(description ? {effect: description.trim()} : {}),
                        ...(category ? { category: category.trim()} : {}),
                        ...(locale ? { locale: locale.trim()} : {})
                    };
                    break;
                }

                case 'ability': {
                    const [name, description] = parts;
                    const formattedName = capitalizeFirstOnly(name?.trim());

                    result.ability[name?.trim()] = {
                        name: formattedName,
                        effect: description?.trim()
                    };
                    break;
                }

                case 'pokemon': {
                    if (line.startsWith('|')) {
                        const [temp1, name, types, evos] = parts;

                        if (evos) {
                            const [evoLine, evoMons] = evos?.split('>');
                            result.pokemon[name?.trim()] = {
                                ...(result.pokemon[name?.trim()]),
                                name: name?.trim(),
                                ...(types ? { types: types.split(',')} : {}),
                                ...(evoLine ? {evoline: evoLine} : {}),
                                ...(evoMons ? {evos: evoMons.split(',')} : {})
                            }
                        } else {
                            result.pokemon[name?.trim()] = {
                                ...(result.pokemon[name?.trim()]),
                                ...(types ? { types: types.split(',')} : {}),
                                name: name?.trim(),
                            }   
                        }
                    } else {
                        const [statsStr, name, typeStr] = parts;
                        
                        const statNames = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
                        const statValues = statsStr?.split(',').map(s => parseInt(s.trim(), 10)) || [];
                        const stats = {};
    
                        statValues.forEach((val, i) => {
                        if (!isNaN(val)) stats[statNames[i]] = val;
                        });
    
                        const types = typeStr ? typeStr.split(',').map(t => t.trim()) : [];
                        result.pokemon[name?.trim()] = {
                            ...(result.pokemon[name?.trim()]),
                            name: name?.trim(),
                            ...(stats && Object.keys(stats).length > 0 ? {stats: stats} : {}),
                            ...(types && types.length > 0 ? {types: types} : {})
                        };
                    }
                    break;
                }

                case 'fakemon': {
                    const fakemonEntry = line.split('|');
                    if (fakemonEntry.length < 6) break;

                    const [statsStr, name, alias, typeStr, sprite, evoStr] = fakemonEntry;
                    const [evoline, evos] = evoStr.split('>');
                    const [hp, atk, def, spa, spd, spe] = statsStr.split(',').map(n => parseInt(n.trim(), 10));

                    let newAlias = alias.includes('>') ? alias.split('>')[0].trim() : alias.trim();
                    let newSprite = alias.includes('>') ? alias.split('>')[1].trim() : alias.trim();

                    result.fakemon[newAlias] = {
                        label: name.trim(), //Why do we have both?
                        name: name.trim(),
                        alias: newAlias,
                        sprite: newSprite, // Again, why both?
                        baseStats: { hp, atk, def, spa, spd, spe },
                        types: typeStr.split(',').map(t => t.trim().toLowerCase()),
                        imgUrl: sprite.trim(),
                        evoline: evoline.trim(),
                        ...(evos && evos.length > 0 ? { evos: evos.split(',').map(e => e.trim()).filter(e => e)} : {}),
                        total: hp + atk + def + spa + spd + spe
                    };
                    break;
                }

                default:
                    console.warn(`Unknown section: ${currentSection}`);
                    break;
            }
        }
    }

    patchOutput[baseName] = result;
}

const patchesOutputPath = path.join(dir, 'patches.json');
fs.writeFileSync(patchesOutputPath, JSON.stringify(patchOutput, null, 2));
console.log(`patches.json written to ${patchesOutputPath}`);