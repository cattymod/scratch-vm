const formatMessage = require('format-message');
const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');

// CattyMod icon
const iconURI = "https://studio.cattymod.app/images/512.png";

/**
 * Class for CattyMod blocks
 * @constructor
 */
class TurboWarpBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'tw',
            name: 'CattyMod',
            color1: '#1DB4FF',
            color2: '#2490f5',
            color3: '#1a75cc',
            docsURI: 'https://cattymod.app/docs/blocks',
            menuIconURI: iconURI,
            blockIconURI: iconURI,

            blocks: [
                {
                    opcode: 'getLastKeyPressed',
                    text: formatMessage({
                        id: 'tw.blocks.lastKeyPressed',
                        default: 'last key pressed',
                        description: 'Block that returns the last key that was pressed'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getButtonIsDown',
                    text: formatMessage({
                        id: 'tw.blocks.buttonIsDown',
                        default: '[MOUSE_BUTTON] mouse button down?',
                        description: 'Block that returns whether a specific mouse button is down'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        MOUSE_BUTTON: {
                            type: ArgumentType.NUMBER,
                            menu: 'mouseButton',
                            defaultValue: '0'
                        }
                    }
                },
                {
                    opcode: 'getColorTheme',
                    text: formatMessage({
                        id: 'tw.blocks.getColorTheme',
                        default: 'Get Accent Theme',
                        description: 'Block that returns the current CattyMod color theme'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getGUITheme',
                    text: formatMessage({
                        id: 'tw.blocks.getGUITheme',
                        default: 'Get GUI Theme',
                        description: 'Block that returns the current CattyMod GUI theme'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getGoIcon',
                    text: formatMessage({
                        id: 'tw.blocks.getGoIcon',
                        default: 'Get Go Icon',
                        description: 'Block that returns the currently selected CattyMod go icon'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'switchLayout',
                    text: formatMessage({
                        id: 'tw.blocks.switchLayout',
                        default: 'Switch Layout to [LAYOUT]',
                        description: 'Switches between Player, Editor, and Fullscreen layouts'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        LAYOUT: {
                            type: ArgumentType.STRING,
                            menu: 'layout',
                            defaultValue: 'player'
                        }
                    }
                },
                {
                    opcode: 'getCurrentLayout',
                    text: formatMessage({
                        id: 'tw.blocks.getCurrentLayout',
                        default: 'Current Layout',
                        description: 'Returns the current CattyMod layout'
                    }),
                    blockType: BlockType.REPORTER
                }
            ],

            menus: {
                mouseButton: {
                    items: [
                        {
                            text: formatMessage({
                                id: 'tw.blocks.mouseButton.primary',
                                default: '(0) primary',
                                description: 'Dropdown item to select primary (usually left) mouse button'
                            }),
                            value: '0'
                        },
                        {
                            text: formatMessage({
                                id: 'tw.blocks.mouseButton.middle',
                                default: '(1) middle',
                                description: 'Dropdown item to select middle mouse button'
                            }),
                            value: '1'
                        },
                        {
                            text: formatMessage({
                                id: 'tw.blocks.mouseButton.secondary',
                                default: '(2) secondary',
                                description: 'Dropdown item to select secondary (usually right) mouse button'
                            }),
                            value: '2'
                        }
                    ],
                    acceptReporters: true
                },
                layout: {
                    items: [
                        {
                            text: formatMessage({
                                id: 'tw.blocks.layout.player',
                                default: 'Player',
                                description: 'Player layout option'
                            }),
                            value: 'player'
                        },
                        {
                            text: formatMessage({
                                id: 'tw.blocks.layout.editor',
                                default: 'Editor',
                                description: 'Editor layout option'
                            }),
                            value: 'editor'
                        },
                        {
                            text: formatMessage({
                                id: 'tw.blocks.layout.fullscreen',
                                default: 'Fullscreen',
                                description: 'Fullscreen layout option'
                            }),
                            value: 'fullscreen'
                        }
                    ],
                    acceptReporters: false
                }
            }
        };
    }

    getLastKeyPressed (args, util) {
        return util.ioQuery('keyboard', 'getLastKeyPressed');
    }

    getButtonIsDown (args, util) {
        const button = Cast.toNumber(args.MOUSE_BUTTON);
        return util.ioQuery('mouse', 'getButtonIsDown', [button]);
    }

    getColorTheme () {
        const storedTheme = localStorage.getItem('tw:theme');

        if (storedTheme === null) {
            return 'Blue';
        }

        const theme = storedTheme.toLowerCase();

        if (theme.includes('red')) return 'Red';
        if (theme.includes('orange')) return 'Orange';
        if (theme.includes('yellow')) return 'Yellow';
        if (theme.includes('green')) return 'Green';
        if (theme.includes('indigo')) return 'Indigo';
        if (theme.includes('violet')) return 'Violet';
        if (theme.includes('purple')) return 'Purple';
        if (theme.includes('rainbow')) return 'Rainbow';

        return 'Blue';
    }

    getGUITheme () {
        const storedTheme = localStorage.getItem('tw:theme');

        if (storedTheme === null) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ?
                'Dark' :
                'Light';
        }

        const theme = storedTheme.toLowerCase();

        if (theme.includes('midnight')) return 'Midnight';
        if (theme.includes('dark')) return 'Dark';
        if (theme.includes('light')) return 'Light';

        return 'Light';
    }

    getGoIcon () {
        const goIcon = localStorage.getItem('cattymod:goIcon');

        if (goIcon === null) return 'Play Button';

        if (goIcon === 'play') return 'Play Button';
        if (goIcon === 'greenflag') return 'Green Flag';
        if (goIcon === 'blueflag') return 'Blue Flag';
        if (goIcon === 'purpleflag') return 'Purple Flag';

        return '';
    }

    // Layout helpers

    getCurrentLayout () {
        const path = window.location.pathname.replace(/\/+$/, '') || '/';

        if (path === '/fullscreen') return 'fullscreen';
        if (path === '/editor') return 'editor';
        if (path === '/') return 'player';

        return 'unknown';
    }

    findLayoutButton (text) {
        return [...document.querySelectorAll('[role="button"]')]
            .find(element => element.textContent.trim() === text);
    }

    async waitForLayoutButton (getter, timeout = 10000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const button = getter();

            if (button) return button;

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        throw new Error('CattyMod: Layout button not found.');
    }

    async exitFullscreen () {
        const button = await this.waitForLayoutButton(() =>
            document.querySelector('.stage-header_stage-button_hkl9B')
        );

        button.click();

        await this.waitForLayoutButton(() =>
            this.findLayoutButton('See inside') ||
            this.findLayoutButton('See Project Page')
        );
    }

    async switchLayout (args) {
        const target = String(args.LAYOUT).toLowerCase();
        let current = this.getCurrentLayout();

        if (!['player', 'editor', 'fullscreen'].includes(target)) {
            return;
        }

        // Already in the requested layout.
        if (current === target) return;

        // Exit fullscreen before switching to Player or Editor.
        if (
            current === 'fullscreen' &&
            (target === 'player' || target === 'editor')
        ) {
            await this.exitFullscreen();
            current = this.getCurrentLayout();
        }

        // Switch to Editor.
        if (target === 'editor' && current === 'player') {
            const button = await this.waitForLayoutButton(() =>
                this.findLayoutButton('See inside')
            );

            button.click();
        }

        // Switch to Player.
        else if (target === 'player' && current === 'editor') {
            const button = await this.waitForLayoutButton(() =>
                this.findLayoutButton('See Project Page')
            );

            button.click();
        }

        // Switch to Fullscreen directly.
        // Does not switch to Editor first.
        else if (target === 'fullscreen') {
            const button = await this.waitForLayoutButton(() =>
                document.querySelector('.stage-header_stage-button_hkl9B')
            );

            button.click();
        }
    }
}

module.exports = TurboWarpBlocks;
