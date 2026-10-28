// OpenCode 2 loads this file automatically from .opencode/plugins/ and does not
// read bonden.mjs next to it, so keep the one-line entry here. npm consumers
// never see it: package.json main/exports still point at bonden.mjs.
export { default } from './bonden.mjs'
