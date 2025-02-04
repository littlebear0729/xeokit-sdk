import {math} from "../math/math.js";
import {createRTCViewMat} from "../math/rtcCoords.js";

/**
 * @desc Provides rendering context to {@link Drawable"}s as xeokit renders them for a frame.
 *
 * Also creates RTC viewing and picking matrices, caching and reusing matrices within each frame.
 *
 * @private
 */
class FrameContext {

    constructor(scene) {

        this._scene = scene;

        this._matPool = [];
        this._matPoolNextFreeIndex = 0;

        this._rtcViewMats = {};
        this._rtcPickViewMats = {};

        this.reset();
    }

    /**
     * Called by the renderer before each frame.
     * @private
     */
    reset() {

        this._matPoolNextFreeIndex = 0;
        this._rtcViewMats = {};
        this._rtcPickViewMats = {};

        /**
         * The WebGL rendering context.
         * @type {WebGLRenderingContext}
         */
        this.gl = this._scene.canvas.gl;

        /**
         * ID of the last {@link WebGLProgram} that was bound during the current frame.
         * @property lastProgramId
         * @type {Number}
         */
        this.lastProgramId = null;

        /**
         * Whether to render a physically-based representation for triangle surfaces.
         *
         * When ````false````, we'll render them with a fast vertex-shaded Gouraud-shaded representation, which
         * is great for zillions of objects.
         *
         * When ````true````, we'll render them at a better visual quality, using smooth, per-fragment shading
         * and a more realistic lighting model.
         *
         * @property quality
         * @default false
         * @type {Boolean}
         */
        this.pbrEnabled = false;

        /**
         * Whether to render color textures for triangle surfaces.
         *
         * @property quality
         * @default false
         * @type {Boolean}
         */
        this.colorTextureEnabled = false;

        /**
         * Whether SAO is currently enabled during the current frame.
         * @property withSAO
         * @default false
         * @type {Boolean}
         */
        this.withSAO = false;

        /**
         * Whether backfaces are currently enabled during the current frame.
         * @property backfaces
         * @default false
         * @type {Boolean}
         */
        this.backfaces = false;

        /**
         * The vertex winding order for what we currently consider to be a backface during current
         * frame: true == "cw", false == "ccw".
         * @property frontFace
         * @default true
         * @type {Boolean}
         */
        this.frontface = true;

        /**
         * The next available texture unit to bind a {@link Texture} to.
         * @defauilt 0
         * @property textureUnit
         * @type {number}
         */
        this.textureUnit = 0;

        /**
         * Performance statistic that counts how many times the renderer has called ````gl.drawElements()```` has been
         * called so far within the current frame.
         * @default 0
         * @property drawElements
         * @type {number}
         */
        this.drawElements = 0;

        /**
         * Performance statistic that counts how many times ````gl.drawArrays()```` has been called so far within
         * the current frame.
         * @default 0
         * @property drawArrays
         * @type {number}
         */
        this.drawArrays = 0;

        /**
         * Performance statistic that counts how many times ````gl.useProgram()```` has been called so far within
         * the current frame.
         * @default 0
         * @property useProgram
         * @type {number}
         */
        this.useProgram = 0;

        /**
         * Statistic that counts how many times ````gl.bindTexture()```` has been called so far within the current frame.
         * @default 0
         * @property bindTexture
         * @type {number}
         */
        this.bindTexture = 0;

        /**
         * Counts how many times the renderer has called ````gl.bindArray()```` so far within the current frame.
         * @defaulr 0
         * @property bindArray
         * @type {number}
         */
        this.bindArray = 0;

        /**
         * Indicates which pass the renderer is currently rendering.
         *
         * See {@link Scene/passes:property"}}Scene#passes{{/crossLink}}, which configures how many passes we render
         * per frame, which typically set to ````2```` when rendering a stereo view.
         *
         * @property pass
         * @type {number}
         */
        this.pass = 0;

        /**
         * The 4x4 viewing transform matrix the renderer is currently using when rendering castsShadows.
         *
         * This sets the viewpoint to look from the point of view of each {@link DirLight}
         * or {@link PointLight} that casts a shadow.
         *
         * @property shadowViewMatrix
         * @type {Number[]}
         */
        this.shadowViewMatrix = null;

        /**
         * The 4x4 viewing projection matrix the renderer is currently using when rendering shadows.
         *
         * @property shadowProjMatrix
         * @type {Number[]}
         */
        this.shadowProjMatrix = null;

        /**
         * The 4x4 viewing transform matrix the renderer is currently using when rendering a ray-pick.
         *
         * This sets the viewpoint to look along the ray given to {@link Scene/pick:method"}}Scene#pick(){{/crossLink}}
         * when picking with a ray.
         *
         * @property pickViewMatrix
         * @type {Number[]}
         */
        this.pickViewMatrix = null;

        /**
         * The 4x4 orthographic projection transform matrix the renderer is currently using when rendering a ray-pick.
         *
         * @property pickProjMatrix
         * @type {Number[]}
         */
        this.pickProjMatrix = null;

        /**
         * Distance to the near clipping plane when rendering depth fragments for GPU-accelerated 3D picking.
         *
         * @property pickZNear
         * @type {Number|*}
         */
        this.pickZNear = 0.01;

        /**
         * Distance to the far clipping plane when rendering depth fragments for GPU-accelerated 3D picking.
         *
         * @property pickZFar
         * @type {Number|*}
         */
        this.pickZFar = 5000;

        /**
         * Whether or not the renderer is currently picking invisible objects.
         *
         * @property pickInvisible
         * @type {Number}
         */
        this.pickInvisible = false;

        /**
         * Used to draw only requested elements / indices.
         *
         * @property pickElementsCount
         * @type {Number}
         */
        this.pickElementsCount = null;

        /**
         * Used to draw only requested elements / indices.
         *
         * @property pickElementsOffset
         * @type {Number}
         */
        this.pickElementsOffset = null;

        /** The current line width.
         *
         * @property lineWidth
         * @type Number
         */
        this.lineWidth = 1;

        /**
         * Collects info from SceneModel.drawSnapInitDepthBuf and SceneModel.drawSnapDepths,
         * which is then used in Renderer to determine snap-picking results.
         *
         * @type {{}}
         */
        this.snapPickLayerParams = {};

        /**
         * Collects info from SceneModel.drawSnapInitDepthBuf and SceneModel.drawSnapDepths,
         * which is then used in Renderer to determine snap-picking results.
         * @type {number}
         */
        this.snapPickLayerNumber = 0;

        /**
         * Collects info from SceneModel.drawSnapInitDepthBuf and SceneModel.drawSnapDepths,
         * which is then used in Renderer to determine snap-picking results.
         * @type {Number[]}
         */
        this.snapPickCoordinateScale = math.vec3();

        /**
         * Collects info from SceneModel.drawSnapInitDepthBuf and SceneModel.drawSnapDepths,
         * which is then used in Renderer to determine snap-picking results.
         * @type {Number[]}
         */
        this.snapPickOrigin = math.vec3();
    }

    /**
     * Get View matrix for the given RTC center.
     */
    getRTCViewMatrix(originHash, origin) {
        let rtcViewMat = this._rtcViewMats[originHash];
        if (!rtcViewMat) {
            rtcViewMat = this._getNewMat();
            createRTCViewMat(this._scene.camera.viewMatrix, origin, rtcViewMat);
            this._rtcViewMats[originHash] = rtcViewMat;
        }
        return rtcViewMat;
    }

    /**
     * Get picking View RTC matrix for the given RTC center.
     */
    getRTCPickViewMatrix(originHash, origin) {
        let rtcPickViewMat = this._rtcPickViewMats[originHash];
        if (!rtcPickViewMat) {
            rtcPickViewMat = this._getNewMat();
            const pickViewMat = this.pickViewMatrix || this._scene.camera.viewMatrix;
            createRTCViewMat(pickViewMat, origin, rtcPickViewMat);
            this._rtcPickViewMats[originHash] = rtcPickViewMat;
        }
        return rtcPickViewMat;
    }

    _getNewMat() {
        let mat = this._matPool[this._matPoolNextFreeIndex];
        if (!mat) {
            mat = math.mat4();
            this._matPool[this._matPoolNextFreeIndex] = mat;
        }
        this._matPoolNextFreeIndex++;
        return mat;
    }
}

export {FrameContext};