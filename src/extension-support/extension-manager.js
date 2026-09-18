const dispatch = require('../dispatch/central-dispatch');
const log = require('../util/log');
const maybeFormatMessage = require('../util/maybe-format-message');

const BlockType = require('./block-type');
const SecurityManager = require('./tw-security-manager');

const defaultBuiltinExtensions = {
    coreExample: () => require('../blocks/scratch3_core_example'),
    pen: () => require('../extensions/scratch3_pen'),
    wedo2: () => require('../extensions/scratch3_wedo2'),
    music: () => require('../extensions/scratch3_music'),
    microbit: () => require('../extensions/scratch3_microbit'),
    text2speech: () => require('../extensions/scratch3_text2speech'),
    translate: () => require('../extensions/scratch3_translate'),
    videoSensing: () => require('../extensions/scratch3_video_sensing'),
    ev3: () => require('../extensions/scratch3_ev3'),
    makeymakey: () => require('../extensions/scratch3_makeymakey'),
    boost: () => require('../extensions/scratch3_boost'),
    gdxfor: () => require('../extensions/scratch3_gdx_for'),
    tw: () => require('../extensions/tw')
};

/**
 * @typedef {object} ArgumentInfo
 * @property {ArgumentType} type
 * @property {*|undefined} default
 */

/**
 * @typedef {object} ConvertedBlockInfo
 * @property {ExtensionBlockMetadata} info
 * @property {object} json
 * @property {string} xml
 */

/**
 * @typedef {object} CategoryInfo
 * @property {string} id
 * @property {string} name
 * @property {string|undefined} blockIconURI
 * @property {string} color1
 * @property {string} color2
 * @property {string} color3
 * @property {Array.<ConvertedBlockInfo>} blocks
 * @property {Array.<object>} menus
 */

/**
 * @typedef {object} PendingExtensionWorker
 * @property {string} extensionURL
 * @property {Function} resolve
 * @property {Function} reject
 */

const createExtensionService = extensionManager => {
    const service = {};

    service.registerExtensionServiceSync =
        extensionManager.registerExtensionServiceSync.bind(extensionManager);

    service.allocateWorker =
        extensionManager.allocateWorker.bind(extensionManager);

    service.onWorkerInit =
        extensionManager.onWorkerInit.bind(extensionManager);

    service.registerExtensionService =
        extensionManager.registerExtensionService.bind(extensionManager);

    service.removeExtension =
        extensionManager.removeExtension.bind(extensionManager);

    return service;
};

class ExtensionManager {
    constructor (vm) {
        this.nextExtensionWorker = 0;

        this.pendingExtensions = [];

        this.pendingWorkers = [];

        this.workerURLs = [];

        this._loadedExtensions = new Map();

        this.securityManager = new SecurityManager();

        this.vm = vm;

        this.runtime = vm.runtime;

        this.loadingAsyncExtensions = 0;

        this.asyncExtensionsLoadedCallbacks = [];

        this.builtinExtensions = Object.assign({}, defaultBuiltinExtensions);

        dispatch.setService('extensions', createExtensionService(this)).catch(e => {
            log.error(
                `ExtensionManager was unable to register extension service: ${JSON.stringify(e)}`
            );
        });
    }

    isExtensionLoaded (extensionID) {
        return this._loadedExtensions.has(extensionID);
    }

    isBuiltinExtension (extensionId) {
        return Object.prototype.hasOwnProperty.call(
            this.builtinExtensions,
            extensionId
        );
    }

    loadExtensionIdSync (extensionId) {
        if (!this.isBuiltinExtension(extensionId)) {
            log.warn(
                `Could not find extension ${extensionId} in the built in extensions.`
            );
            return;
        }

        if (this.isExtensionLoaded(extensionId)) {
            const message =
                `Rejecting attempt to load a second extension with ID ${extensionId}`;

            log.warn(message);
            return;
        }

        const extension = this.builtinExtensions[extensionId]();
        const extensionInstance = new extension(this.runtime);

        const serviceName =
            this._registerInternalExtension(extensionInstance);

        this._loadedExtensions.set(extensionId, serviceName);

        this.runtime.compilerRegisterExtension(
            extensionId,
            extensionInstance
        );
    }

    addBuiltinExtension (extensionId, extensionClass) {
        this.builtinExtensions[extensionId] = () => extensionClass;
    }

    _isValidExtensionURL (extensionURL) {
        try {
            const parsedURL = new URL(extensionURL);

            return (
                parsedURL.protocol === 'https:' ||
                parsedURL.protocol === 'http:' ||
                parsedURL.protocol === 'data:' ||
                parsedURL.protocol === 'file:'
            );
        } catch (e) {
            return false;
        }
    }

    async loadExtensionURL (extensionURL) {
        if (this.isBuiltinExtension(extensionURL)) {
            this.loadExtensionIdSync(extensionURL);
            return;
        }

        if (this.isExtensionURLLoaded(extensionURL)) {
            return;
        }

        if (!this._isValidExtensionURL(extensionURL)) {
            throw new Error(`Invalid extension URL: ${extensionURL}`);
        }

        this.runtime.setExternalCommunicationMethod(
            'customExtensions',
            true
        );

        this.loadingAsyncExtensions++;

        const sandboxMode =
            await this.securityManager.getSandboxMode(extensionURL);

        const rewritten =
            await this.securityManager.rewriteExtensionURL(extensionURL);

        if (sandboxMode === 'unsandboxed') {
            const {load} =
                require('./tw-unsandboxed-extension-runner');

            const extensionObjects = await load(
                rewritten,
                this.vm
            ).catch(error =>
                this._failedLoadingExtensionScript(error)
            );

            const fakeWorkerId = this.nextExtensionWorker++;

            this.workerURLs[fakeWorkerId] = extensionURL;

            for (const extensionObject of extensionObjects) {
                const extensionInfo = extensionObject.getInfo();

                const serviceName =
                    `unsandboxed.${fakeWorkerId}.${extensionInfo.id}`;

                dispatch.setServiceSync(
                    serviceName,
                    extensionObject
                );

                dispatch.callSync(
                    'extensions',
                    'registerExtensionServiceSync',
                    serviceName
                );

                this._loadedExtensions.set(
                    extensionInfo.id,
                    serviceName
                );
            }

            this._finishedLoadingExtensionScript();
            return;
        }

        /* eslint-disable max-len */
        let ExtensionWorker;

        if (sandboxMode === 'worker') {
            ExtensionWorker =
                require(
                    'worker-loader?name=js/extension-worker/extension-worker.[hash].js!./extension-worker'
                );
        } else if (sandboxMode === 'iframe') {
            ExtensionWorker =
                (await import(
                    /* webpackChunkName: "iframe-extension-worker" */
                    './tw-iframe-extension-worker'
                )).default;
        } else {
            throw new Error(
                `Invalid sandbox mode: ${sandboxMode}`
            );
        }
        /* eslint-enable max-len */

        return new Promise((resolve, reject) => {
            this.pendingExtensions.push({
                extensionURL: rewritten,
                resolve,
                reject
            });

            dispatch.addWorker(new ExtensionWorker());
        }).catch(error =>
            this._failedLoadingExtensionScript(error)
        );
    }

    allAsyncExtensionsLoaded () {
        if (this.loadingAsyncExtensions === 0) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.asyncExtensionsLoadedCallbacks.push({
                resolve,
                reject
            });
        });
    }

    refreshBlocks (optExtensionId) {
        const refresh = serviceName =>
            dispatch.call(serviceName, 'getInfo')
                .then(info => {
                    info = this._prepareExtensionInfo(
                        serviceName,
                        info
                    );

                    dispatch.call(
                        'runtime',
                        '_refreshExtensionPrimitives',
                        info
                    );
                })
                .catch(e => {
                    log.error(
                        'Failed to refresh built-in extension primitives',
                        e
                    );
                });

        if (optExtensionId) {
            if (!this._loadedExtensions.has(optExtensionId)) {
                return Promise.reject(
                    new Error(
                        `Unknown extension: ${optExtensionId}`
                    )
                );
            }

            return refresh(
                this._loadedExtensions.get(optExtensionId)
            );
        }

        const allPromises =
            Array.from(this._loadedExtensions.values())
                .map(refresh);

        return Promise.all(allPromises);
    }

    /**
     * Remove a loaded extension from the VM.
     *
     * This version makes sure EXTENSION_REMOVED is emitted even if
     * the runtime's _blockInfo array does not contain a matching
     * extension entry.
     *
     * @param {string} extensionId
     * @returns {Promise|undefined}
     */
    removeExtension (extensionId) {
        if (!this._loadedExtensions.has(extensionId)) {
            log.warn(
                `Cannot remove extension ${extensionId}: extension is not loaded.`
            );

            return;
        }

        const serviceName =
            this._loadedExtensions.get(extensionId);

        const service =
            dispatch.services[serviceName];

        // Dispose the extension if possible.
        if (
            service &&
            typeof service.dispose === 'function'
        ) {
            try {
                service.dispose();
            } catch (e) {
                log.warn(
                    `Error disposing extension ${extensionId}:`,
                    e
                );
            }
        }

        // Remove the extension service.
        if (service) {
            delete dispatch.services[serviceName];
        }

        // Remove compiler extension reference.
        if (this.runtime[`ext_${extensionId}`]) {
            delete this.runtime[`ext_${extensionId}`];
        }

        // Determine worker ID.
        const dotParts =
            serviceName.split('.');

        const underscoreParts =
            serviceName.split('_');

        let workerId = null;

        if (dotParts.length >= 2) {
            workerId = Number(dotParts[1]);
        } else if (underscoreParts.length >= 2) {
            workerId = Number(underscoreParts[1]);
        }

        if (Number.isInteger(workerId)) {
            delete this.workerURLs[workerId];
        }

        /*
         * Remove from the loaded extension registry FIRST.
         *
         * This is important because anything rebuilding the toolbox
         * after EXTENSION_REMOVED should see the extension as unloaded.
         */
        this._loadedExtensions.delete(extensionId);

        /*
         * Remove the extension from runtime block information if
         * this runtime contains the extension as a category.
         */
        try {
            const blockInfo =
                this.runtime._blockInfo;

            if (
                blockInfo &&
                Array.isArray(blockInfo)
            ) {
                /*
                 * Some TurboWarp versions store extension categories
                 * directly in _blockInfo.
                 */
                for (let i = blockInfo.length - 1; i >= 0; i--) {
                    const info = blockInfo[i];

                    if (
                        info &&
                        (
                            info.id === extensionId ||
                            info.extensionId === extensionId
                        )
                    ) {
                        blockInfo.splice(i, 1);
                    }
                }
            }
        } catch (e) {
            log.warn(
                `Error removing extension block info for ${extensionId}:`,
                e
            );
        }

        /*
         * Notify scratch-gui immediately.
         *
         * This is intentionally outside the _blockInfo condition.
         * Even if _blockInfo has already been cleaned up, the GUI
         * still needs to rebuild its toolbox.
         */
        if (this.runtime.emit) {
            this.runtime.emit(
                'EXTENSION_REMOVED',
                extensionId
            );
        }

        /*
         * Refresh remaining extensions.
         *
         * This keeps the VM's primitive/block information synchronized
         * after removal.
         */
        return this.refreshBlocks()
            .catch(e => {
                log.warn(
                    `Failed to refresh blocks after removing extension ${extensionId}:`,
                    e
                );
            });
    }

    allocateWorker () {
        const id =
            this.nextExtensionWorker++;

        const workerInfo =
            this.pendingExtensions.shift();

        this.pendingWorkers[id] =
            workerInfo;

        this.workerURLs[id] =
            workerInfo.extensionURL;

        return [
            id,
            workerInfo.extensionURL
        ];
    }

    registerExtensionServiceSync (serviceName) {
        const info =
            dispatch.callSync(
                serviceName,
                'getInfo'
            );

        this._registerExtensionInfo(
            serviceName,
            info
        );
    }

    registerExtensionService (serviceName) {
        dispatch.call(
            serviceName,
            'getInfo'
        ).then(info => {
            this._loadedExtensions.set(
                info.id,
                serviceName
            );

            this._registerExtensionInfo(
                serviceName,
                info
            );

            this._finishedLoadingExtensionScript();
        });
    }

    _finishedLoadingExtensionScript () {
        this.loadingAsyncExtensions--;

        if (this.loadingAsyncExtensions === 0) {
            this.asyncExtensionsLoadedCallbacks
                .forEach(i => i.resolve());

            this.asyncExtensionsLoadedCallbacks = [];
        }
    }

    _failedLoadingExtensionScript (error) {
        this.loadingAsyncExtensions--;

        this.asyncExtensionsLoadedCallbacks
            .forEach(i => i.reject(error));

        this.asyncExtensionsLoadedCallbacks = [];

        throw error;
    }

    onWorkerInit (id, e) {
        const workerInfo =
            this.pendingWorkers[id];

        delete this.pendingWorkers[id];

        if (e) {
            workerInfo.reject(e);
        } else {
            workerInfo.resolve();
        }
    }

    _registerInternalExtension (extensionObject) {
        const extensionInfo =
            extensionObject.getInfo();

        const fakeWorkerId =
            this.nextExtensionWorker++;

        const serviceName =
            `extension_${fakeWorkerId}_${extensionInfo.id}`;

        dispatch.setServiceSync(
            serviceName,
            extensionObject
        );

        dispatch.callSync(
            'extensions',
            'registerExtensionServiceSync',
            serviceName
        );

        return serviceName;
    }

    _registerExtensionInfo (
        serviceName,
        extensionInfo
    ) {
        extensionInfo =
            this._prepareExtensionInfo(
                serviceName,
                extensionInfo
            );

        dispatch.call(
            'runtime',
            '_registerExtensionPrimitives',
            extensionInfo
        ).catch(e => {
            log.error(
                `Failed to register primitives for extension on service ${serviceName}:`,
                e
            );
        });
    }

    _prepareExtensionInfo (
        serviceName,
        extensionInfo
    ) {
        extensionInfo =
            Object.assign({}, extensionInfo);

        if (!/^[a-z0-9]+$/i.test(extensionInfo.id)) {
            throw new Error(
                'Invalid extension id'
            );
        }

        extensionInfo.name =
            extensionInfo.name ||
            extensionInfo.id;

        extensionInfo.blocks =
            extensionInfo.blocks || [];

        extensionInfo.targetTypes =
            extensionInfo.targetTypes || [];

        extensionInfo.blocks =
            extensionInfo.blocks.reduce(
                (results, blockInfo) => {
                    try {
                        let result;

                        switch (blockInfo) {
                        case '---':
                            result = '---';
                            break;

                        default:
                            result =
                                this._prepareBlockInfo(
                                    serviceName,
                                    blockInfo
                                );
                            break;
                        }

                        results.push(result);
                    } catch (e) {
                        log.error(
                            `Error processing block: ${e.message}, Block:\n${JSON.stringify(blockInfo)}`
                        );
                    }

                    return results;
                },
                []
            );

        extensionInfo.menus =
            extensionInfo.menus || {};

        extensionInfo.menus =
            this._prepareMenuInfo(
                serviceName,
                extensionInfo.menus
            );

        return extensionInfo;
    }

    _prepareMenuInfo (
        serviceName,
        menus
    ) {
        const menuNames =
            Object.getOwnPropertyNames(menus);

        for (
            let i = 0;
            i < menuNames.length;
            i++
        ) {
            const menuName =
                menuNames[i];

            let menuInfo =
                menus[menuName];

            if (!menuInfo.items) {
                menuInfo = {
                    items: menuInfo
                };

                menus[menuName] =
                    menuInfo;
            }

            if (
                typeof menuInfo.items === 'string'
            ) {
                const menuItemFunctionName =
                    menuInfo.items;

                const serviceObject =
                    dispatch.services[serviceName];

                menuInfo.items =
                    this._getExtensionMenuItems.bind(
                        this,
                        serviceObject,
                        menuItemFunctionName
                    );
            }
        }

        return menus;
    }

    _getExtensionMenuItems (
        extensionObject,
        menuItemFunctionName
    ) {
        const editingTarget =
            this.runtime.getEditingTarget() ||
            this.runtime.getTargetForStage();

        const editingTargetID =
            editingTarget ?
                editingTarget.id :
                null;

        const extensionMessageContext =
            this.runtime.makeMessageContextForTarget(
                editingTarget
            );

        const menuFunc =
            extensionObject[
                menuItemFunctionName
            ];

        const menuItems =
            menuFunc
                .call(
                    extensionObject,
                    editingTargetID
                )
                .map(item => {
                    item =
                        maybeFormatMessage(
                            item,
                            extensionMessageContext
                        );

                    switch (typeof item) {
                    case 'object':
                        return [
                            maybeFormatMessage(
                                item.text,
                                extensionMessageContext
                            ),
                            item.value
                        ];

                    case 'string':
                        return [
                            item,
                            item
                        ];

                    default:
                        return item;
                    }
                });

        if (
            !menuItems ||
            menuItems.length < 1
        ) {
            throw new Error(
                `Extension menu returned no items: ${menuItemFunctionName}`
            );
        }

        return menuItems;
    }

    _prepareBlockInfo (
        serviceName,
        blockInfo
    ) {
        if (blockInfo.blockType === BlockType.XML) {
            blockInfo =
                Object.assign({}, blockInfo);

            blockInfo.xml =
                String(blockInfo.xml) || '';

            return blockInfo;
        }

        blockInfo = Object.assign(
            {},
            {
                blockType: BlockType.COMMAND,
                terminal: false,
                blockAllThreads: false,
                arguments: {}
            },
            blockInfo
        );

        blockInfo.text =
            blockInfo.text ||
            blockInfo.opcode;

        switch (blockInfo.blockType) {
        case BlockType.EVENT:
            if (blockInfo.func) {
                log.warn(
                    `Ignoring function "${blockInfo.func}" for event block ${blockInfo.opcode}`
                );
            }
            break;

        case BlockType.BUTTON:
            if (blockInfo.opcode) {
                log.warn(
                    `Ignoring opcode "${blockInfo.opcode}" for button with text: ${blockInfo.text}`
                );
            }

            blockInfo.callFunc = () => {
                dispatch.call(
                    serviceName,
                    blockInfo.func
                );
            };
            break;

        case BlockType.LABEL:
            if (blockInfo.opcode) {
                log.warn(
                    `Ignoring opcode "${blockInfo.opcode}" for label: ${blockInfo.text}`
                );
            }
            break;

        default: {
            if (!blockInfo.opcode) {
                throw new Error(
                    'Missing opcode for block'
                );
            }

            const funcName =
                blockInfo.func ||
                blockInfo.opcode;

            const getBlockInfo =
                blockInfo.isDynamic ?
                    args =>
                        args &&
                        args.mutation &&
                        args.mutation.blockInfo :
                    () => blockInfo;

            const callBlockFunc = (() => {
                if (
                    dispatch._isRemoteService(
                        serviceName
                    )
                ) {
                    return (
                        args,
                        util,
                        realBlockInfo
                    ) =>
                        dispatch.call(
                            serviceName,
                            funcName,
                            args,
                            util,
                            realBlockInfo
                        ).then(result => {
                            if (
                                typeof result === 'number' ||
                                typeof result === 'string' ||
                                typeof result === 'boolean'
                            ) {
                                return result;
                            }

                            return `${result}`;
                        });
                }

                const serviceObject =
                    dispatch.services[serviceName];

                if (
                    !serviceObject[funcName]
                ) {
                    log.warn(
                        `Could not find extension block function called ${funcName}`
                    );
                }

                return (
                    args,
                    util,
                    realBlockInfo
                ) =>
                    serviceObject[funcName](
                        args,
                        util,
                        realBlockInfo
                    );
            })();

            blockInfo.func =
                (args, util) => {
                    const realBlockInfo =
                        getBlockInfo(args);

                    return callBlockFunc(
                        args,
                        util,
                        realBlockInfo
                    );
                };

            break;
        }
        }

        return blockInfo;
    }

    getExtensionURLs () {
        const extensionURLs = {};

        for (
            const [
                extensionId,
                serviceName
            ] of this._loadedExtensions.entries()
        ) {
            if (
                Object.prototype.hasOwnProperty.call(
                    this.builtinExtensions,
                    extensionId
                )
            ) {
                continue;
            }

            const workerId =
                +serviceName.split('.')[1];

            const extensionURL =
                this.workerURLs[workerId];

            if (
                typeof extensionURL === 'string'
            ) {
                extensionURLs[extensionId] =
                    extensionURL;
            }
        }

        return extensionURLs;
    }

    isExtensionURLLoaded (url) {
        return Object.values(
            this.workerURLs
        ).includes(url);
    }
}

module.exports = ExtensionManager;
