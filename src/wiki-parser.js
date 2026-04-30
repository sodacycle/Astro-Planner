/**
 * Wikipedia Infobox Parser for Astronomical Objects
 * Fetches and parses infobox data from Wikipedia articles
 */

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

const CONSTELLATION_MAP = {
    "And": "Andromeda", "Ant": "Antlia", "Aps": "Apus", "Aqr": "Aquarius", "Aql": "Aquila",
    "Ara": "Ara", "Ari": "Aries", "Aur": "Auriga", "Boo": "Boötes", "Cae": "Caelum",
    "Cam": "Camelopardalis", "Cnc": "Cancer", "CVn": "Canes Venatici", "CMa": "Canis Major",
    "CMi": "Canis Minor", "Cap": "Capricornus", "Car": "Carina", "Cas": "Cassiopeia",
    "Cen": "Centaurus", "Cep": "Cepheus", "Cet": "Cetus", "Cha": "Chamaeleon", "Cir": "Circinus",
    "Col": "Columba", "Com": "Coma Berenices", "CrA": "Corona Australis", "CrB": "Corona Borealis",
    "Crv": "Corvus", "Crt": "Crater", "Cru": "Crux", "Cyg": "Cygnus", "Del": "Delphinus",
    "Dor": "Dorado", "Dra": "Draco", "Equ": "Equuleus", "Eri": "Eridanus", "For": "Fornax",
    "Gem": "Gemini", "Gru": "Grus", "Her": "Hercules", "Hor": "Horologium", "Hya": "Hydra",
    "Hyi": "Hydrus", "Ind": "Indus", "Lac": "Lacerta", "Leo": "Leo", "LMi": "Leo Minor",
    "Lep": "Lepus", "Lib": "Libra", "Lup": "Lupus", "Lyn": "Lynx", "Lyr": "Lyra",
    "Men": "Mensa", "Mic": "Microscopium", "Mon": "Monoceros", "Mus": "Musca", "Nor": "Norma",
    "Oct": "Octans", "Oph": "Ophiuchus", "Ori": "Orion", "Pav": "Pavo", "Peg": "Pegasus",
    "Per": "Perseus", "Phe": "Phoenix", "Pic": "Pictor", "Psc": "Pisces", "PsA": "Piscis Austrinus",
    "Pup": "Puppis", "Pyx": "Pyxis", "Ret": "Reticulum", "Sge": "Sagitta", "Sgr": "Sagittarius",
    "Sco": "Scorpius", "Scl": "Sculptor", "Sct": "Scutum", "Ser": "Serpens", "Sex": "Sextans",
    "Tau": "Taurus", "Tel": "Telescopium", "Tri": "Triangulum", "TrA": "Triangulum Australe",
    "Tuc": "Tucana", "UMa": "Ursa Major", "UMi": "Ursa Minor", "Vel": "Vela", "Vir": "Virgo",
    "Vol": "Volans", "Vul": "Vulpecula"
};

function getFullConstellation(abbr) {
    return CONSTELLATION_MAP[abbr] || abbr || 'N/A';
}

/**
 * Fetch and parse Wikipedia infobox data for an astronomical object
 * @param {string} wikiUrl - Wikipedia URL or article title
 * @param {string} objectName - Name of the object (fallback for title)
 * @returns {Promise<Object>} Parsed infobox data
 */
async function fetchWikipediaInfobox(wikiUrl, objectName) {
    try {
        let title = extractTitleFromUrl(wikiUrl, objectName);

        const apiUrl = `${WIKIPEDIA_API}?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&origin=*`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error(`Wikipedia API error: ${response.status}`);
        }

        const data = await response.json();
        const htmlContent = data.parse?.text?.['*'];

        if (!htmlContent) {
            return { error: 'No content found' };
        }

        return parseInfobox(htmlContent);
    } catch (e) {
        console.error('Wikipedia infobox fetch error:', e);
        return { error: e.message };
    }
}

/**
 * Extract article title from Wikipedia URL or use object name
 */
function extractTitleFromUrl(wikiUrl, objectName) {
    if (wikiUrl && wikiUrl.includes('wikipedia.org')) {
        if (wikiUrl.includes('search=')) {
            return wikiUrl.split('search=')[1].replace(/\+/g, ' ');
        }
        return wikiUrl.split('/').pop().replace(/_/g, ' ');
    }

    return objectName.replace(/^(NGC|IC|M)(\d+)$/i, '$1 $2');
}

/**
 * Parse infobox from Wikipedia HTML content
 */
function parseInfobox(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const infobox = doc.querySelector('.infobox, .infobox.vcard');
    if (!infobox) {
        return { error: 'No infobox found' };
    }

    const result = {};
    const rows = infobox.querySelectorAll('tr');

    rows.forEach(row => {
        const header = row.querySelector('th');
        const cell = row.querySelector('td');

        if (!header || !cell) return;

        const label = header.textContent.trim().toLowerCase();
        const value = cell.textContent.trim();

        if (label.includes('observation data')) {
            result.observationData = value;
        } else if (label.includes('constellation')) {
            result.constellation = extractTextFromCell(cell);
        } else if (label.includes('right ascension')) {
            result.rightAscension = value;
        } else if (label.includes('declination')) {
            result.declination = value;
        } else if (label.includes('redshift')) {
            result.redshift = value;
        } else if (label.includes('heliocentric radial velocity') || label.includes('radial velocity')) {
            result.radialVelocity = value;
        } else if (label.includes('distance')) {
            result.distance = extractTextFromCell(cell);
        } else if (label.includes('apparent magnitude') || label.includes('apparent visual magnitude')) {
            result.apparentMagnitude = value;
        } else if (label.includes('type')) {
            result.type = extractTextFromCell(cell);
        } else if (label.includes('size') && !label.includes('apparent')) {
            result.size = value;
        } else if (label.includes('apparent size')) {
            result.apparentSize = value;
        }
    });

    return result;
}

/**
 * Extract clean text from a table cell, removing references and extra markup
 */
function extractTextFromCell(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.reference, sup').forEach(ref => ref.remove());
    return clone.textContent.trim().replace(/\s+/g, ' ');
}

/**
 * Format distance value for display
 */
function formatDistance(distanceStr) {
    if (!distanceStr) return 'N/A';

    const match = distanceStr.match(/(\d+(?:\.\d+)?)\s*(Mly|kly|ly|kpc|Mpc|pc)/i);
    if (match) {
        return `${match[1]} ${match[2]}`;
    }

    return distanceStr.substring(0, 50);
}

window.fetchWikipediaInfobox = fetchWikipediaInfobox;
window.formatDistance = formatDistance;
window.getFullConstellation = getFullConstellation;
