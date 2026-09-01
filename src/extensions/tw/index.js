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
            color1: '#4da8ff',
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
                        default: 'Get Color Theme',
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

        // If tw:theme does not exist, default to Blue.
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

        // Unknown or missing color = Blue.
        return 'Blue';
    }

    getGUITheme () {
        const storedTheme = localStorage.getItem('tw:theme');

        // If tw:theme does not exist, use the system theme.
        if (storedTheme === null) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ?
                'Dark' :
                'Light';
        }

        const theme = storedTheme.toLowerCase();

        if (theme.includes('dark')) return 'Dark';
        if (theme.includes('light')) return 'Light';

        // If no GUI theme is specified, default to Light.
        return 'Light';
    }
}

module.exports = TurboWarpBlocks;
