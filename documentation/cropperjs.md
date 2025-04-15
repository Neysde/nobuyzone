Guide
Introduction

Cropper.js 2.0 is a series of web components for image cropping.

    What is the difference between Cropper.js 1.0 and Cropper.js 2.0?

Type	Cropper.js 1.0	Cropper.js 2.0
Created	2015	2021
Status	Maintaining	Active
Package Number	1	12+
Architecture	All in one	Modular
Browser Compatibility	Modern browsers / IE 9+	Modern browsers
Extensible	No	Yes
Customizable	No	Yes
CSS-in-JS	No	Yes
Import on-demand	No	Yes
Multiple selections	No	Yes
Rotate image on touch	No	Yes

    What is the difference between Cropper, Cropper.js, and jQuery Cropper?

GitHub Project	npm Package	Dependencies	Created	Status	Description
Cropper	cropper	jquery	2014	Deprecated	A simple jQuery image cropping plugin.
Cropper.js	cropperjs	-	2015	Active	JavaScript image cropper.
jQuery Cropper	jquery-cropper	jquery + cropperjs	2018	Maintaining	A jQuery plugin wrapper for Cropper.js.
Getting started
Installation
npm

npm is the recommended installation method when building large-scale applications with Cropper.js.
sh

npm install cropperjs@next

For a specific package:
sh

npm install @cropper/element-canvas

CDN

For prototyping or learning purposes, you can use the latest version with:
html

<script src="https://unpkg.com/cropperjs@next"></script>

For production, we recommend linking to a specific version number and build to avoid unexpected breakage from newer versions.
Usage
Use in JavaScript

Import the Cropper class and constructing a new Cropper instance.
js

import Cropper from 'cropperjs';

const cropper = new Cropper('#image');

html

<img id="image" src="/cropperjs/v2/picture.jpg" alt="Picture">

Use in DOM

Import all Cropper elements from the cropperjs package and define them as custom elements automatically.
js

import 'cropperjs';

html

<cropper-canvas background>
  <cropper-image src="/cropperjs/v2/picture.jpg" alt="Picture" rotatable scalable skewable translatable></cropper-image>
  <cropper-shade hidden></cropper-shade>
  <cropper-handle action="select" plain></cropper-handle>
  <cropper-selection initial-coverage="0.5" movable resizable>
    <cropper-grid role="grid" covered></cropper-grid>
    <cropper-crosshair centered></cropper-crosshair>
    <cropper-handle action="move" theme-color="rgba(255, 255, 255, 0.35)"></cropper-handle>
    <cropper-handle action="n-resize"></cropper-handle>
    <cropper-handle action="e-resize"></cropper-handle>
    <cropper-handle action="s-resize"></cropper-handle>
    <cropper-handle action="w-resize"></cropper-handle>
    <cropper-handle action="ne-resize"></cropper-handle>
    <cropper-handle action="nw-resize"></cropper-handle>
    <cropper-handle action="se-resize"></cropper-handle>
    <cropper-handle action="sw-resize"></cropper-handle>
  </cropper-selection>
</cropper-canvas>

Use on-demand

Import the required Cropper elements only and define them as custom elements manually.
js

import CropperCanvas from '@cropper/element-canvas';
import CropperImage from '@cropper/element-image';
import CropperHandle from '@cropper/element-handle';

CropperCanvas.$define();
CropperImage.$define();
CropperHandle.$define();

html

<cropper-canvas background>
  <cropper-image src="/cropperjs/v2/picture.jpg" alt="Picture" rotatable scalable skewable translatable></cropper-image>
  <cropper-handle action="move" plain></cropper-handle>
</cropper-canvas>

Packages

Cropper.js contains a series of npm packages:
Package	Version	Description
cropperjs	Version	The all-in-one package.
@cropper/element	Version	An abstract class for constructing Cropper elements.
@cropper/element-canvas	Version	A custom canvas element for the Cropper.
@cropper/element-image	Version	A custom image element for the Cropper.
@cropper/element-shade	Version	A custom shade element for the Cropper.
@cropper/element-handle	Version	A custom handle element for the Cropper.
@cropper/element-selection	Version	A custom selection element for the Cropper.
@cropper/element-grid	Version	A custom grid element for the Cropper.
@cropper/element-crosshair	Version	A custom crosshair element for the Cropper.
@cropper/element-viewer	Version	A custom viewer element for the Cropper.
@cropper/elements	Version	A series of custom elements for the Cropper.
@cropper/utils	Version	A series of common constants and utility functions for Cropper.
Interfaces
Interface	Inherits	Description
Cropper	Function	The Cropper constructor creates a new Cropper instance.
CropperElement	HTMLElement	The CropperElement interface represents any Cropper element, extends the HTMLElement interface.
CropperCanvas	CropperElement	The CropperCanvas interface provides properties and methods for manipulating the layout and presentation of <cropper-canvas> elements.
CropperImage	CropperElement	The CropperImage interface provides properties and methods for manipulating the layout and presentation of <cropper-image> elements.
CropperShade	CropperElement	The CropperShade interface provides properties and methods for manipulating the layout and presentation of <cropper-shade> elements.
CropperHandle	CropperElement	The CropperHandle interface provides properties and methods for manipulating the layout and presentation of <cropper-handle> elements.
CropperSelection	CropperElement	The CropperSelection interface provides properties and methods for manipulating the layout and presentation of <cropper-selection> elements.
CropperGrid	CropperElement	The CropperGrid interface provides properties and methods for manipulating the layout and presentation of <cropper-grid> elements.
CropperCrosshair	CropperElement	The CropperCrosshair interface provides properties and methods for manipulating the layout and presentation of <cropper-crosshair> elements.
CropperViewer	CropperElement	The CropperViewer interface provides properties and methods for manipulating the layout and presentation of <cropper-viewer> elements.
Browser support

    Edge 79+
    Firefox 63+
    Chrome 54+
    Safari 10.1+
    Opera 41+
    iOS Safari 10.3+
    Android Browser 81+
    Opera Mobile 46+
    Chrome for Android 81+
    Firefox for Android 68+
    Samsung Internet 6.2+




Cropper

The Cropper constructor creates a new Cropper instance.
Usage
Syntax
js

new Cropper(element[, options])

    element
        Type: HTMLImageElement | HTMLCanvasElement | string
        The target image or canvas element for cropping. If it is a string, will be passed into the document.querySelector to find the element.

    options (optional)
        Type: Object
        The options for cropping.

Example

Options
Name	Type	Default	Description
container	Element | string	Defaults to the parent element of the target element, or document.body if the parent element is null.	The Cropper container. If it is a string, it will be passed into the document.querySelector to find the element.
template	string	Defaults to a built-in template, see below.	The Cropper template.

The default template for the Cropper:
html

<cropper-canvas background>
  <cropper-image></cropper-image>
  <cropper-shade hidden></cropper-shade>
  <cropper-handle action="select" plain></cropper-handle>
  <cropper-selection initial-coverage="0.5" movable resizable>
    <cropper-grid role="grid" bordered covered></cropper-grid>
    <cropper-crosshair centered></cropper-crosshair>
    <cropper-handle action="move" theme-color="rgba(255, 255, 255, 0.35)"></cropper-handle>
    <cropper-handle action="n-resize"></cropper-handle>
    <cropper-handle action="e-resize"></cropper-handle>
    <cropper-handle action="s-resize"></cropper-handle>
    <cropper-handle action="w-resize"></cropper-handle>
    <cropper-handle action="ne-resize"></cropper-handle>
    <cropper-handle action="nw-resize"></cropper-handle>
    <cropper-handle action="se-resize"></cropper-handle>
    <cropper-handle action="sw-resize"></cropper-handle>
  </cropper-selection>
</cropper-canvas>

Instance Properties
Name	Type	Description
element	HTMLImageElement | HTMLCanvasElement	The normalized Cropper element.
options	Object	The normalized Cropper options.
container	Element	The normalized Cropper container.
Instance Methods
getCropperCanvas

    Syntax: getCropperCanvas()
    Alternative: cropper.container.querySelector('cropper-canvas')
    Returns:
        Type: CropperCanvas | null
        The <cropper-canvas> element if any.

Get the <cropper-canvas> element in the Cropper container.
getCropperImage

    Syntax: getCropperImage()
    Alternative: cropper.container.querySelector('cropper-image')
    Returns:
        Type: CropperImage | null
        The <cropper-image> element if any.

Get the <cropper-image> element in the Cropper container.
getCropperSelection

    Syntax: getCropperSelection()
    Alternative: cropper.container.querySelector('cropper-selection')
    Returns:
        Type: CropperSelection | null
        The <cropper-selection> element if any.

Get the <cropper-selection> element in the Cropper container.
getCropperSelections

    Syntax: getCropperSelections()
    Alternative: cropper.container.querySelectorAll('cropper-selection')
    Returns:
        Type: NodeListOf<CropperSelection> | null
        The <cropper-selection> element if any.

Get all the <cropper-selection> elements in the Cropper container when there are multiple selections.
Exported Modules
js

import {
  // Constants
  DEFAULT_TEMPLATE,

  // Elements
  CropperElement,
  CropperCanvas,
  CropperImage,
  CropperShade,
  CropperHandle,
  CropperSelection,
  CropperGrid,
  CropperCrosshair,
  CropperViewer,
} from 'cropperjs';