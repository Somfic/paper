const SVG_NS = 'http://www.w3.org/2000/svg'

// bisect
const fit = (el, a = 1, b = 44) => {
    const c = Math.floor(a + (b - a) / 2)
    el.style.fontSize = `${c}px`
    if (b - a === 1) return
    if (el.scrollHeight > el.clientHeight
    || el.scrollWidth > el.clientWidth) fit(el, a, c)
    else fit(el, c, b)
}

// laid out at 540 and drawn at 2× → a 1080 × 1080 card
const width = 540
const height = 540
const pixelRatio = 2

// The card is rendered by an <img> loading a serialised SVG, which has no
// access to the page's fonts or the network — only families installed on the
// reader's machine resolve, so both stacks end in a generic.
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

// paper's own look: the reader theme's tint and ink, defaulting to sepia
const FALLBACK = {
    bg: '#f4ecd8',
    fg: '#5b4636',
    dim: '#8a7a63',
    vignette: 'rgba(0,0,0,0.07)',
    grain: 0.17,
}

// Structure is styled inline rather than from the <style> below: only the
// subtree of `main` is copied into the SVG, so anything the imported nodes
// need must travel with them.
const html = `<style>
:host {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
}
</style>
<main style="box-sizing: border-box; width: ${width}px; height: ${height}px; padding: 52px 56px 44px; overflow: hidden; display: flex; flex-direction: column; justify-content: center; text-align: center; background: var(--bg); color: var(--fg); font-family: ${SERIF}; box-shadow: inset 0 0 130px var(--vignette)">
    <style>
    style { display: none }
    .clamp {
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        text-overflow: ellipsis;
    }
    </style>
    <div style="flex: 0 0 auto; font-size: min(3em, 104px); line-height: .62; color: var(--dim); opacity: .5">&#8220;</div>
    <div id="text" style="flex: 0 0 auto; margin-top: .5em; line-height: 1.42; text-wrap: balance"></div>
    <div style="flex: 0 0 auto; width: 54px; height: 1px; margin: 30px auto 0; background: currentColor; opacity: .25"></div>
    <div style="flex: 0 0 auto; margin-top: 18px; font-family: ${SANS}">
        <cite id="title" class="clamp" style="display: block; font-size: 14px; font-style: normal; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; text-wrap: balance"></cite>
        <div id="author" class="clamp" style="margin-top: 7px; font-size: 12px; letter-spacing: .02em; color: var(--dim)"></div>
    </div>
</main>`

// TODO: lang, vertical writing
customElements.define('foliate-quoteimage', class extends HTMLElement {
    #root = this.attachShadow({ mode: 'closed' })
    constructor() {
        super()
        this.#root.innerHTML = html
    }
    async getBlob({ title, author, text, theme }) {
        const t = { ...FALLBACK, ...theme }
        const main = this.#root.querySelector('main')
        main.style.setProperty('--bg', t.bg)
        main.style.setProperty('--fg', t.fg)
        main.style.setProperty('--dim', t.dim)
        main.style.setProperty('--vignette', t.vignette)
        this.#root.querySelector('#title').textContent = title
        this.#root.querySelector('#author').textContent = author
        this.#root.querySelector('#text').innerText = text

        fit(main)

        const img = document.createElement('img')
        return new Promise(resolve => {
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = pixelRatio * width
                canvas.height = pixelRatio * height
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                canvas.toBlob(resolve)
            }
            img.onerror = () => resolve(null)
            const doc = document.implementation.createDocument(SVG_NS, 'svg')
            doc.documentElement.setAttribute('viewBox', `0 0 ${width} ${height}`)
            doc.documentElement.setAttribute('width', width)
            doc.documentElement.setAttribute('height', height)
            const obj = doc.createElementNS(SVG_NS, 'foreignObject')
            obj.setAttribute('width', width)
            obj.setAttribute('height', height)
            obj.append(doc.importNode(main, true))
            doc.documentElement.append(obj)
            // the reader's paper grain (same feTurbulence recipe as
            // ReaderStage), laid over the finished card
            const filter = doc.createElementNS(SVG_NS, 'filter')
            filter.setAttribute('id', 'paper-grain')
            const turbulence = doc.createElementNS(SVG_NS, 'feTurbulence')
            turbulence.setAttribute('type', 'fractalNoise')
            turbulence.setAttribute('baseFrequency', '1.1')
            turbulence.setAttribute('numOctaves', '1')
            turbulence.setAttribute('stitchTiles', 'stitch')
            const desaturate = doc.createElementNS(SVG_NS, 'feColorMatrix')
            desaturate.setAttribute('type', 'saturate')
            desaturate.setAttribute('values', '0')
            filter.append(turbulence, desaturate)
            const grain = doc.createElementNS(SVG_NS, 'rect')
            grain.setAttribute('width', width)
            grain.setAttribute('height', height)
            grain.setAttribute('filter', 'url(#paper-grain)')
            grain.setAttribute('opacity', t.grain)
            doc.documentElement.append(filter, grain)
            // encoded, not raw: theme colours are `#rrggbb`, and a bare `#`
            // in a data URI starts the fragment and truncates the document
            img.src = 'data:image/svg+xml;charset=utf-8,'
                + encodeURIComponent(new XMLSerializer().serializeToString(doc))
        })
    }
})
