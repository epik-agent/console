import '@testing-library/jest-dom'

// jsdom doesn't implement scrollIntoView; polyfill to avoid test errors
// noinspection JSUnusedGlobalSymbols
window.HTMLElement.prototype.scrollIntoView = () => {}
