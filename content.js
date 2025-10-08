// @content.js

(function() {
    // Prevent multiple injections
    if (document.getElementById('drawing-toolbar-extension')) {
        return;
    }
    // --- Configuration ---
    const TOOLBAR_ID = 'drawing-toolbar-extension';
    const CANVAS_ID = 'drawing-canvas-extension';
    const PREFIX = 'dt-';
    const INVITE_DIALOG_ID = 'dt-invite-dialog';
    const EXPORT_DIALOG_ID = 'dt-export-choice-dialog';
    const SHARE_DIALOG_ID = 'dt-share-dialog';
    const INVITE_URL_BASE = 'https://annotateweb.com/?join=';
    const SHARE_API_BASE = 'https://annotateweb.surfly.workers.dev/';

    // --- State ---
    let currentTool = 'navigate';
    let currentColor = '#6200d9';
    let currentLineWidth = 5;
    let isDrawing = false;
    let startX, startY; // These will become document-relative
    let canvas, ctx;
    let snapshot;
    let drawingOperations = []; // To store all drawing operations
    let undoStack = []; // To store operations that were undone (for redo)
    let currentPath = null; // To store current pen/eraser path

    let isDraggingToolbar = false;
    let toolbarOffsetX, toolbarOffsetY;

    // --- Helper Functions --- (No changes)
    function hexToRgba(hex, alpha = 1) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Generate short UUID for sharing
    function generateShortId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    // Helper function to get document-relative coordinates from mouse or touch events
    function getDocumentRelativeCoordinates(event) {
        // Handle touch events
        if (event.touches && event.touches.length > 0) {
            // Use the first touch point
            return {
                x: event.touches[0].clientX + window.scrollX,
                y: event.touches[0].clientY + window.scrollY
            };
        } else if (event.changedTouches && event.changedTouches.length > 0) {
            // For touchend/touchcancel events where touches[] is empty
            return {
                x: event.changedTouches[0].clientX + window.scrollX,
                y: event.changedTouches[0].clientY + window.scrollY
            };
        }
        // Handle mouse events
        return {
            x: event.clientX + window.scrollX,
            y: event.clientY + window.scrollY
        };
    }

    // NEW: Function to draw all stored annotations onto a given canvas context
    function drawAnnotationsOnCanvas(targetCtx, operations, offsetX = 0, offsetY = 0) {
        if (!targetCtx || !operations) return;


        operations.forEach(op => {
            targetCtx.strokeStyle = op.color;
            targetCtx.fillStyle = op.color;
            targetCtx.lineWidth = op.lineWidth;
            targetCtx.globalCompositeOperation = op.compositeOperation || 'source-over';

            targetCtx.beginPath();

            if (op.tool === 'pen' || op.tool === 'eraser' || op.tool === 'highlight') {
                if (op.points && op.points.length > 0) {
                    const firstPoint = op.points[0];
                    targetCtx.moveTo(firstPoint.x - offsetX, firstPoint.y - offsetY);
                    for (let i = 1; i < op.points.length; i++) {
                        const point = op.points[i];
                        targetCtx.lineTo(point.x - offsetX, point.y - offsetY);
                    }
                    targetCtx.stroke();
                }
            } else if (op.tool === 'rectangle') {
                targetCtx.strokeRect(
                    op.startX - offsetX,
                    op.startY - offsetY,
                    op.endX - op.startX,
                    op.endY - op.startY
                );
            } else if (op.tool === 'line') {
                targetCtx.moveTo(op.startX - offsetX, op.startY - offsetY);
                targetCtx.lineTo(op.endX - offsetX, op.endY - offsetY);
                targetCtx.stroke();
            } else if (op.tool === 'circle') {
                targetCtx.arc(
                    op.centerX - offsetX,
                    op.centerY - offsetY,
                    op.radius,
                    0,
                    2 * Math.PI
                );
                targetCtx.stroke();
            } else if (op.tool === 'text') {
                targetCtx.font = op.font;
                const fontSize = parseFloat(op.font) || 16;
                targetCtx.fillText(op.text, op.x - offsetX, op.y - offsetY + fontSize);
            }
        });
        targetCtx.globalCompositeOperation = 'source-over'; // Reset
    }

    // --- UI Creation ---
    function createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.id = TOOLBAR_ID;
        toolbar.className = `${PREFIX}toolbar`;
        toolbar.innerHTML = `
            <div class="${PREFIX}toolbar-rows">
                <!-- First Row: Drawing Tools -->
                <div class="${PREFIX}toolbar-row">
                    <div class="${PREFIX}tool-group">
                        <button data-tool="navigate" class="${PREFIX}tool-button" title="Navigate Website">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 4.1L12 6M5.1 8l-2.9-.8M6 12l-1.9 2M7.2 2.2L8 5.1m1.037 4.59a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/></svg>
                        </button>
                        <button data-tool="highlight" class="${PREFIX}tool-button" title="Highlight">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m9 11l-6 6v3h9l3-3"/><path d="m22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></g></svg>
                        </button>
                        <button data-tool="pen" class="${PREFIX}tool-button" title="Pen">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
                        </button>
                        <button data-tool="line" class="${PREFIX}tool-button" title="Line">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 20h9M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
                        </button>
                        <button data-tool="rectangle" class="${PREFIX}tool-button" title="Rectangle">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><rect width="20" height="12" x="2" y="6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" rx="2"/></svg>
                        </button>
                        <button data-tool="circle" class="${PREFIX}tool-button" title="Circle">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
                        </button>
                        <button data-tool="text" class="${PREFIX}tool-button" title="Text">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1M7 22h1a4 4 0 0 0 4-4v-1M7 2h1a4 4 0 0 1 4 4v1"/></svg>
                        </button>
                        <button data-tool="eraser" class="${PREFIX}tool-button" title="Eraser">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m7 21l-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21m9 0H7M5 11l9 9"/></svg>
                        </button>
                    </div>
                    <div class="${PREFIX}drag-handle"></div>
                </div>
                
                <!-- Second Row: Controls and Actions -->
                <div class="${PREFIX}toolbar-row">

                    <div class="${PREFIX}tool-group ${PREFIX}actions">
                        <button id="${PREFIX}export-button" class="${PREFIX}tool-button" title="Export to Image">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></g></svg>
                        </button>
                        <button id="${PREFIX}share-button" class="${PREFIX}tool-button" title="Share Annotations">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></g></svg>
                        </button>
                        <button id="${PREFIX}invite-button" class="${PREFIX}tool-button" title="Invite">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></g></svg>
                        </button>
                        <button id="${PREFIX}undo-button" class="${PREFIX}tool-button" title="Undo">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14 4 9l5-5M4 9h11c4 0 6 2 6 6s-2 6-6 6h-5"/></svg>
                        </button>
                        <button id="${PREFIX}redo-button" class="${PREFIX}tool-button" title="Redo">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m15 14 5-5-5-5M20 9H9c-4 0-6 2-6 6s2 6 6 6h5"/></svg>
                        </button>
                        <button id="${PREFIX}clear-button" class="${PREFIX}tool-button" title="Clear Canvas">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6"/></svg>️
                        </button>
                    </div>
                    <div class="${PREFIX}tool-group">
                        <input type="color" id="${PREFIX}color-picker" value="${currentColor}" title="Color Picker">
                        <select id="${PREFIX}line-width" title="Line Width">
                            <option value="3">3px</option>
                            <option value="5" selected>5px</option>
                            <option value="8">8px</option>
                            <option value="12">12px</option>
                            <option value="20">20px</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(toolbar);

        // Toolbar Dragging Logic
        const dragHandle = toolbar.querySelector(`.${PREFIX}drag-handle`);
        
        // Ensure the drag handle is properly set up
        if (dragHandle) {
            // Mouse drag support
            dragHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Stop event from bubbling to parent elements
                isDraggingToolbar = true;
                const currentRect = toolbar.getBoundingClientRect(); // Get current position
                toolbarOffsetX = e.clientX - currentRect.left;
                toolbarOffsetY = e.clientY - currentRect.top;
                
                toolbar.style.transform = 'none'; // Remove transform for direct positioning
                toolbar.style.left = `${currentRect.left}px`; // Set explicit left/top
                toolbar.style.top = `${currentRect.top}px`;
                toolbar.style.bottom = 'auto'; // Clear bottom positioning for mobile
                // Don't set width and height here to prevent toolbar growth
            });
            
            // Touch drag support
            dragHandle.addEventListener('touchstart', (e) => {
                e.preventDefault(); // Prevent scrolling when trying to drag the toolbar
                e.stopPropagation(); // Stop event from bubbling to parent elements
                isDraggingToolbar = true;
                const currentRect = toolbar.getBoundingClientRect(); // Get current position
                toolbarOffsetX = e.touches[0].clientX - currentRect.left;
                toolbarOffsetY = e.touches[0].clientY - currentRect.top;
                
                toolbar.style.transform = 'none'; // Remove transform for direct positioning
                toolbar.style.left = `${currentRect.left}px`; // Set explicit left/top
                toolbar.style.top = `${currentRect.top}px`;
                toolbar.style.bottom = 'auto'; // Clear bottom positioning for mobile
                // Don't set width and height here to prevent toolbar growth
                dragHandle.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none'; // Prevent text selection while dragging
                e.preventDefault();
            });
        }
        

        // Toolbar Event Listeners
        toolbar.querySelectorAll(`.${PREFIX}tool-button[data-tool]`).forEach(button => {
            button.addEventListener('click', () => selectTool(button.dataset.tool));
        });
        document.getElementById(`${PREFIX}color-picker`).addEventListener('input', (e) => {
            currentColor = e.target.value;
            if (ctx) {
                ctx.strokeStyle = currentColor;
                ctx.fillStyle = currentColor;
            }
            if (currentTool !== 'navigate') applyToolSettings();
            selectTool(currentTool); // To update pen cursor color
        });

        document.getElementById(`${PREFIX}line-width`).addEventListener('change', (e) => {
            currentLineWidth = parseInt(e.target.value, 10);
            if (ctx) ctx.lineWidth = currentLineWidth;
            if (currentTool !== 'navigate') applyToolSettings();
            selectTool(currentTool); // To update eraser cursor size
        });

        document.getElementById(`${PREFIX}undo-button`).addEventListener('click', undoOperation);
        document.getElementById(`${PREFIX}redo-button`).addEventListener('click', redoOperation);
        document.getElementById(`${PREFIX}clear-button`).addEventListener('click', clearCanvas);
    }

    function addGlobalDragListeners() {
        // Mouse move event for dragging
        window.addEventListener('mousemove', (e) => {
            if (isDraggingToolbar) {
                const tb = document.getElementById(TOOLBAR_ID);
                if (!tb) { // Safety check
                    isDraggingToolbar = false;
                    return;
                }
                let newX = e.clientX - toolbarOffsetX;
                let newY = e.clientY - toolbarOffsetY;

                // Constrain to viewport
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const toolbarRect = tb.getBoundingClientRect();

                if (newX < 0) newX = 0;
                if (newY < 0) newY = 0;
                if (newX + toolbarRect.width > viewportWidth) newX = viewportWidth - toolbarRect.width;
                if (newY + toolbarRect.height > viewportHeight) newY = viewportHeight - toolbarRect.height;

                // Apply new position
                tb.style.left = `${newX}px`;
                tb.style.top = `${newY}px`;
                e.preventDefault(); // Prevent any default behavior while dragging
            }
        }, { passive: false }); // Important: passive: false to allow preventDefault
        
        // Touch move event for dragging on touch devices
        window.addEventListener('touchmove', (e) => {
            if (isDraggingToolbar) {
                e.preventDefault(); // Prevent scrolling while dragging toolbar
                const tb = document.getElementById(TOOLBAR_ID);
                if (!tb || !e.touches || e.touches.length === 0) { // Safety check
                    isDraggingToolbar = false;
                    return;
                }
                let newX = e.touches[0].clientX - toolbarOffsetX;
                let newY = e.touches[0].clientY - toolbarOffsetY;

                // Constrain to viewport
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const toolbarRect = tb.getBoundingClientRect();

                if (newX < 0) newX = 0;
                if (newY < 0) newY = 0;
                if (newX + toolbarRect.width > viewportWidth) newX = viewportWidth - toolbarRect.width;
                if (newY + toolbarRect.height > viewportHeight) newY = viewportHeight - toolbarRect.height;

                // Apply new position
                tb.style.left = `${newX}px`;
                tb.style.top = `${newY}px`;
            }
        }, { passive: false }); // Important: passive: false to allow preventDefault

        // Mouse up event to end dragging
        window.addEventListener('mouseup', (e) => {
            if (isDraggingToolbar) {
                isDraggingToolbar = false;
                const tb = document.getElementById(TOOLBAR_ID);
                if (tb) {
                    const dragHandle = tb.querySelector(`.${PREFIX}drag-handle`);
                    if (dragHandle) dragHandle.style.cursor = 'grab';
                }
                document.body.style.userSelect = ''; // Re-enable text selection
            }
        });
        
        // Touch end event to end dragging on touch devices
        window.addEventListener('touchend', (e) => {
            if (isDraggingToolbar) {
                isDraggingToolbar = false;
                const tb = document.getElementById(TOOLBAR_ID);
                if (tb) {
                    const dragHandle = tb.querySelector(`.${PREFIX}drag-handle`);
                    if (dragHandle) dragHandle.style.cursor = 'grab';
                }
                document.body.style.userSelect = ''; // Re-enable text selection
            }
        });
        
        // Touch cancel event to handle interrupted touch events
        window.addEventListener('touchcancel', (e) => {
            if (isDraggingToolbar) {
                isDraggingToolbar = false;
                const tb = document.getElementById(TOOLBAR_ID);
                if (tb) {
                    const dragHandle = tb.querySelector(`.${PREFIX}drag-handle`);
                    if (dragHandle) dragHandle.style.cursor = 'grab';
                }
                document.body.style.userSelect = '';
            }
        });
    }


    function createCanvas() { // MODIFIED
        canvas = document.createElement('canvas');
        canvas.id = CANVAS_ID;
        canvas.className = `${PREFIX}canvas`;
        // Set canvas dimensions to the viewport size
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Style canvas to be fixed position, covering the viewport
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = '2147483645'; // Ensure it's below toolbar (toolbar is often 2147483647 or higher)
        canvas.style.pointerEvents = 'none'; // Initially no pointer events, enabled by selectTool for drawing tools

        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');

        applyToolSettings();

        // Event listeners (mousedown, mousemove, mouseup, mouseleave) remain,
        // but their effectiveness is now gated by canvas.style.pointerEvents and the isDrawing flag.
        // Mouse event listeners
        canvas.addEventListener('mousedown', startDrawing);
        window.addEventListener('mousemove', draw); // Keep global for drawing continuity if mouse leaves canvas while drawing
        window.addEventListener('mouseup', stopDrawing); // Keep global to catch mouseup even if outside canvas
        window.addEventListener('mouseleave', stopDrawingOnLeave); // Specifically for mouse leaving window
        
        // Touch event listeners
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        window.addEventListener('touchmove', draw, { passive: false }); // Keep global for drawing continuity if touch leaves canvas
        window.addEventListener('touchend', stopDrawing); // Keep global to catch touchend even if outside canvas
        window.addEventListener('touchcancel', stopDrawingOnLeave); // Handle touch cancellation
    }

    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .${PREFIX}toolbar {
                position: fixed;
                top: 20px; /* Initial position */
                left: 50%;
                transform: translateX(-50%); /* Initial centering */
                background: linear-gradient(145deg, #2c3e50 0%, #1a252f 100%);
                border: 1px solid #11181f;
                border-top: 1px solid #4a5c6d; /* Subtle top highlight */
                border-radius: 8px;
                padding: 5px 8px; /* Reduced padding a bit */
                box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0px rgba(255,255,255,0.05);
                z-index: 2147483646;
                font-family: 'Segoe UI', 'Roboto', sans-serif;
                color: #e0e0e0;
                cursor: grab; /* Indicate draggable */
                transition: opacity 0.3s, visibility 0.3s; /* For toggle */
                max-width: calc(100% - 20px); /* Prevent overflow on small screens */
                width: auto; /* Allow it to be as wide as needed, but not more than max-width */
            }
            
            .${PREFIX}toolbar-rows {
                display: flex;
                flex-direction: column;
                gap: 8px;
                width: 100%;
            }
            
            .${PREFIX}toolbar-row {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                justify-content: flex-start; /* Align items to the left */
            }
            .${PREFIX}toolbar.hidden {
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
            }
            .${PREFIX}drag-handle { /* Dedicated drag area */
                width: 20px; 
                height: 24px;
                background: repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px);
                margin-right: 5px;
                border-radius: 4px;
                cursor: grab;
                flex-shrink: 0; /* Prevent drag handle from shrinking */
            }
            .${PREFIX}tool-group {
                display: flex;
                flex-wrap: wrap; /* Allow tool buttons to wrap within groups */
                gap: 5px;
                align-items: center;
                padding: 3px 5px;
                background: rgba(0,0,0,0.1);
                border-radius: 5px;
                /* Make sure the tool group can shrink if needed but maintain a minimum size */
                min-width: 80px;
                justify-content: flex-start; /* Align items to the left */
            }
            .${PREFIX}tool-group.${PREFIX}actions {
                background: transparent; /* Actions group might not need own background */
            }
            
            /* Responsive adjustments */
            @media (max-width: 768px) {
                .${PREFIX}toolbar {
                    top: auto; /* Move to bottom on small screens */
                    bottom: 10px;
                    padding: 4px 6px; /* Slightly smaller padding */
                }
                .${PREFIX}tool-group {
                    gap: 3px; /* Smaller gap on small screens */
                    padding: 2px 4px; /* Smaller padding */
                }
            }
            
            @media (max-width: 480px) {
                .${PREFIX}toolbar {
                    left: 10px;
                    right: 10px;
                    transform: none; /* Don't use transform on small screens for better performance */
                    width: calc(100% - 20px); /* Full width minus margins */
                    max-width: none; /* Override max-width */
                }
                .${PREFIX}tool-button {
                    padding: 5px 7px !important; /* Smaller buttons */
                }
                /* Make sure the rows stack nicely on very small screens */
                .${PREFIX}tool-group {
                    flex-grow: 1;
                    justify-content: center;
                }
            }
            .${PREFIX}tool-button {
                background: linear-gradient(to bottom, #3a4b5c, #2c3a47);
                border: 1px solid #1e2833;
                color: #d0d8e0;
                padding: 7px 9px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.15s ease-out;
                box-shadow: inset 0 1px 0px rgba(255,255,255,0.08), 0 1px 1px rgba(0,0,0,0.2);
                line-height: 1;
                display: flex; /* Improve button layout */
                align-items: center;
                justify-content: center;
                min-width: 34px; /* Ensure minimum button size for touch */
                min-height: 34px; /* Ensure minimum button size for touch */
            }
            .${PREFIX}tool-button:hover {
                background: linear-gradient(to bottom, #4a5f73, #364655);
                border-color: #2a3845;
                color: #ffffff;
            }
            .${PREFIX}tool-button.${PREFIX}active {
                background: linear-gradient(to bottom, #00bfff, #009acd); /* Deep sky blue / Cyanish */
                color: #ffffff;
                border-color: #007aa3;
                box-shadow: inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 0px rgba(255,255,255,0.1);
            }
            /* Special styling for navigate button when active */
            .${PREFIX}tool-button[data-tool="navigate"].${PREFIX}active {
                background: linear-gradient(to bottom, #8e44ad, #7d3c98); /* Purple gradient for active */
                border-color: #6c3483;
                font-weight: bold;
            }
            
            .${PREFIX}tool-button[data-tool="navigate"].${PREFIX}active:hover {
                background: linear-gradient(to bottom, #a569bd, #8e44ad);
                border-color: #5b2c6f;
            }

            #${PREFIX}color-picker {
                width: 36px;
                height: 32px;
                border: 1px solid #1e2833;
                border-radius: 4px;
                padding: 0;
                cursor: pointer;
                background-color: #2c3a47;
                box-shadow: inset 0 1px 0px rgba(255,255,255,0.05);
                min-width: 34px; /* Ensure minimum touch size */
                min-height: 34px; /* Ensure minimum touch size */
            }
            #${PREFIX}color-picker::-webkit-color-swatch-wrapper { padding: 2px; }
            #${PREFIX}color-picker::-webkit-color-swatch {
                border: 1px solid #506070;
                border-radius: 2px;
            }
            #${PREFIX}line-width {
                padding: 7px 5px;
                border-radius: 4px;
                border: 1px solid #1e2833;
                background-color: #2c3a47;
                color: #d0d8e0;
                font-size: 13px;
                box-shadow: inset 0 1px 0px rgba(255,255,255,0.05);
            }
            #${PREFIX}line-width option {
                background-color: #2c3a47;
                color: #d0d8e0;
            }

            .${PREFIX}canvas {
                position: fixed; /* Changed from absolute */
                top: 0;
                left: 0;
                /* width and height will be set dynamically */
                z-index: 2147483645; /* Below toolbar, above page */
                pointer-events: none;
                transition: opacity 0.3s, visibility 0.3s;
            }
            .${PREFIX}canvas.${PREFIX}drawing-active { pointer-events: auto; }
            .${PREFIX}canvas.hidden {
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
            }

            /* Styles for temporary text input */
            .${PREFIX}text-input {
                position: fixed;
                z-index: 2147483647; /* Max z-index, above canvas/toolbar */
                background-color: white !important;
                border: 2px solid #6200d9 !important;
                border-radius: 4px !important;
                padding: 8px !important;
                font-size: 16px !important;
                color: #333 !important;
                min-width: 120px !important;
                max-width: 180px !important;
                width: auto !important;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
                outline: none !important;
                font-family: Arial, sans-serif !important;
                transition: border-color 0.2s !important;
                margin: 0 !important;
                line-height: 1.4 !important;
            }
            .${PREFIX}text-input:focus {
                border-color: #4800a0 !important;
                box-shadow: 0 2px 12px rgba(98, 0, 217, 0.4) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // --- Drawing Logic & Tool Management ---
    function applyToolSettings() { // (Largely same as before)
        if (!ctx || !canvas) return;

        if (currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = Math.max(5, currentLineWidth * 1.5); // Eraser typically larger
            ctx.strokeStyle = 'rgba(0,0,0,1)'; // Eraser color doesn't matter for destination-out
        } else if (currentTool === 'highlight') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth = Math.max(8, currentLineWidth * 2); // Highlighter is wider
            ctx.strokeStyle = hexToRgba(currentColor, 0.4); // Semi-transparent version of the color
            ctx.fillStyle = hexToRgba(currentColor, 0.4);
        } else if (currentTool === 'text') {
            // Text tool specific settings (e.g., font) can be applied here if needed when text is drawn
            // For now, ensure it doesn't inherit drawing styles meant for shapes/pen
            ctx.globalCompositeOperation = 'source-over'; // Default drawing mode
            // Potentially set font here, e.g., ctx.font = "16px Arial";
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth = currentLineWidth; // Apply the current line width
            ctx.strokeStyle = currentColor;
            ctx.fillStyle = currentColor;
        }
    }

    function selectTool(tool) {
        currentTool = tool;
        const buttons = document.querySelectorAll(`.${PREFIX}tool-button`);
        buttons.forEach(button => button.classList.remove(`${PREFIX}active`));
        const selectedButton = document.querySelector(`.${PREFIX}tool-button[data-tool="${tool}"]`);
        if (selectedButton) {
            selectedButton.classList.add(`${PREFIX}active`);
        }

        if (!canvas) return;

        switch (tool) {
            case 'pen':
            case 'line':
            case 'rectangle':
            case 'circle':
            case 'highlight': // Added highlight tool
            case 'eraser':
            case 'text': // Text tool also needs pointer events on canvas for click
                canvas.style.cursor = (tool === 'text') ? 'text' : 'crosshair';
                canvas.style.pointerEvents = 'auto'; // Enable drawing interactions
                break;
            case 'navigate':
            default:
                canvas.style.cursor = 'default';
                canvas.style.pointerEvents = 'none'; // Disable drawing interactions on canvas itself
                break;
        }

        // Clear any existing temporary text input if switching away from text tool
        const existingInput = document.getElementById(`${PREFIX}text-input`);
        if (existingInput && tool !== 'text') {
            // Pass `false` to drawTextAndRemoveInput to prevent drawing, just remove input.
            drawTextAndRemoveInput(existingInput, false);
        }

        // Apply tool settings after selecting tool
        applyToolSettings();
    }

    function startDrawing(e) {
        // For touch events, only prevent default when we're going to draw
        // This allows normal scrolling when in navigation mode
        if (e.type === 'touchstart' && currentTool !== 'navigate') {
            e.preventDefault();
        } else if (e.type === 'mousedown' && e.button !== 0) {
            // For mouse events, only proceed with left button
            return;
        }
        
        if (isDraggingToolbar) return; // Don't start drawing if toolbar is being dragged

        const docCoords = getDocumentRelativeCoordinates(e);
        // startX and startY are now document-relative
        startX = docCoords.x;
        startY = docCoords.y;


        if (currentTool === 'navigate') return;

        if (currentTool === 'text') {
            // For text tool, we don't start drawing, we show a text input at click position
            handleTextToolClick(startX, startY); // Document-relative coordinates
            return; // Exit early, no further drawing logic needed
        }

        isDrawing = true;

        // Apply current tool settings to canvas drawing context
        applyToolSettings();

        if (currentTool === 'pen' || currentTool === 'eraser' || currentTool === 'highlight') {
            // Create a new path object to store the pen, highlight, or eraser operation
            currentPath = {
                tool: currentTool,
                points: [{ x: startX, y: startY }], // Document-relative coordinates
                color: currentTool === 'highlight' ? hexToRgba(currentColor, 0.4) : currentColor,
                lineWidth: ctx.lineWidth,
                compositeOperation: ctx.globalCompositeOperation
            };
            // Apply tool-specific settings for the viewport drawing
            ctx.lineWidth = currentPath.lineWidth;
            ctx.globalCompositeOperation = currentPath.compositeOperation;
        } else if (['rectangle', 'circle', 'line'].includes(currentTool)) {
            // Snapshot is for viewport preview, still useful.
            snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        ctx.beginPath();
        // Drawing on the fixed canvas uses viewport coordinates.
        // For pen/eraser/line, this is the first point.
        ctx.moveTo(e.clientX, e.clientY);
    }

    function draw(e) {
        // Only prevent default for touch events when actually drawing
        // This allows normal scrolling when not in drawing mode
        if (e.type === 'touchmove' && isDrawing) {
            e.preventDefault();
        }
        
        if (!isDrawing && !isDraggingToolbar) return;

        if (isDraggingToolbar) {
            const toolbar = document.getElementById(TOOLBAR_ID);
            let newX = e.clientX - toolbarOffsetX;
            let newY = e.clientY - toolbarOffsetY;

            // Keep toolbar within viewport bounds (optional)
            // newX = Math.max(0, Math.min(newX, window.innerWidth - toolbar.offsetWidth));
            // newY = Math.max(0, Math.min(newY, window.innerHeight - toolbar.offsetHeight));

            toolbar.style.left = `${newX}px`;
            toolbar.style.top = `${newY}px`;
            return;
        }

        if (!isDrawing) return;

        const docCoords = getDocumentRelativeCoordinates(e);
        const currX = docCoords.x; // Document-relative X
        const currY = docCoords.y; // Document-relative Y

        // Viewport-relative coordinates for drawing on the fixed canvas
        const viewportCurrentX = e.clientX;
        const viewportCurrentY = e.clientY;
        // Also convert startX/Y to viewport (subtract scroll) when needed
        const viewportStartX = startX - window.scrollX;
        const viewportStartY = startY - window.scrollY;

        if (currentTool === 'pen' || currentTool === 'eraser' || currentTool === 'highlight') {
            if (currentPath) {
                currentPath.points.push({ x: docCoords.x, y: docCoords.y });
            }
            // Draw on the viewport canvas using viewport coordinates
            ctx.lineTo(viewportCurrentX, viewportCurrentY);
            ctx.stroke();
            // For pen/eraser/line, begin new path so each segment is separate if desired (or keep as one long path)
            // ctx.beginPath(); // This might be needed if stroke() doesn't auto-begin
            // ctx.moveTo(viewportCurrentX, viewportCurrentY); // And then move to current point
        } else if (snapshot && (currentTool === 'rectangle' || currentTool === 'circle' || currentTool === 'line')) {
            ctx.putImageData(snapshot, 0, 0); // Restore snapshot (covers entire viewport canvas)
            ctx.beginPath(); // Need to beginPath after restoring for the new shape

            // Convert document-relative startX/startY to viewport-relative for drawing the preview
            ctx.moveTo(viewportStartX, viewportStartY);

            if (currentTool === 'rectangle') {
                ctx.strokeRect(
                    viewportStartX,
                    viewportStartY,
                    viewportCurrentX - viewportStartX,
                    viewportCurrentY - viewportStartY
                );
            } else if (currentTool === 'circle') {
                const radius = Math.sqrt(Math.pow(viewportCurrentX - viewportStartX, 2) + Math.pow(viewportCurrentY - viewportStartY, 2));
                ctx.arc(viewportStartX, viewportStartY, radius, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (currentTool === 'line') {
                ctx.lineTo(viewportCurrentX, viewportCurrentY);
                ctx.stroke();
            }
        }
    }

    function stopDrawing(e) {
        // Handle mouse events
        if (e.type === 'mouseleave' && !isDrawing) return; // Only stop if actually drawing
        if (e.type === 'mouseup' && e.button !== 0) return; // Only react to left button
        
        // Handle touch events
        if (e.type === 'touchend' || e.type === 'touchcancel') {
            // No additional checks needed for touch events
        }

        if (!isDrawing) {
            // If not drawing (e.g. click release without drag after selecting a tool,
            // or if text tool was active and handled its own input closure)
            return;
        }

        isDrawing = false;
        const docCoords = getDocumentRelativeCoordinates(e);
        
        // Clear the redo stack when a new drawing action is completed
        undoStack = [];


        if (currentTool === 'pen' || currentTool === 'eraser' || currentTool === 'highlight') {
            if (currentPath) {
                // Only add point if mouse actually moved, to avoid zero-length segments if possible
                // However, a final point is always needed to complete the line segment from the previous point
                currentPath.points.push({ x: docCoords.x, y: docCoords.y });

                if (currentPath.points.length > 1) { // Ensure there's at least a start and end point
                    drawingOperations.push(currentPath);
                }
                currentPath = null;
            }
            if (currentTool === 'eraser') {
                // Reset composite operation for future non-eraser tools on the viewport canvas
                ctx.globalCompositeOperation = 'source-over';
            }
        } else if (['rectangle', 'circle', 'line'].includes(currentTool)) {
            if (snapshot) {
                // Restore the canvas to the state before this shape's preview started.
                // This effectively clears the preview from the viewport canvas.
                ctx.putImageData(snapshot, 0, 0);
                snapshot = null;
            }

            let operation = {
                tool: currentTool,
                color: currentColor,
                lineWidth: currentLineWidth,
                startX: startX, // Document-relative
                startY: startY, // Document-relative
                endX: docCoords.x, // Document-relative
                endY: docCoords.y, // Document-relative
            };

            if (currentTool === 'circle') {
                const radius = Math.sqrt(Math.pow(docCoords.x - startX, 2) + Math.pow(docCoords.y - startY, 2));
                operation.centerX = startX; // Document-relative center
                operation.centerY = startY; // Document-relative center
                operation.radius = radius;
                delete operation.endX; // Not needed as center and radius define the circle
                delete operation.endY;
            }
            // Ensure the shape has some dimension before storing
            if (currentTool === 'rectangle' && (startX === docCoords.x || startY === docCoords.y)) { /* no op */ }
            else if (currentTool === 'line' && startX === docCoords.x && startY === docCoords.y) { /* no op */ }
            else if (currentTool === 'circle' && operation.radius === 0) { /* no op */ }
            else {
                drawingOperations.push(operation);
            }
        }
        // For 'text', the operation is added in drawTextAndRemoveInput function when text is submitted.

        // After any drawing operation is completed and stored, redraw the visible parts.
        // Text tool calls redraw from drawTextAndRemoveInput, so skip here for text tool.
        if (currentTool !== 'text') {
             redrawVisibleAnnotations();
        }

        ctx.beginPath(); // Prepare for next drawing operation on the viewport canvas
        applyToolSettings(); // Re-apply current tool settings (e.g., reset eraser's composite op if switching)
    }

    function stopDrawingOnLeave(e) { // (Same)
        if (isDrawing && e.target.nodeName === 'HTML' && !isDraggingToolbar) {
            stopDrawing(e);
        }
    }

    function clearCanvas() { // MODIFIED
        // Save current operations to undo stack before clearing
        if (drawingOperations.length > 0) {
            undoStack = []; // Clear redo stack when making a new action
            undoStack.push([...drawingOperations]); // Create a copy of the operations
            drawingOperations = []; // Clear all stored operations
            redrawVisibleAnnotations(); // Redraw (which will clear the canvas)
        }
    }
    
    // Undo the last drawing operation
    function undoOperation() {
        if (drawingOperations.length > 0) {
            // Store the last operation for potential redo
            const lastOperation = drawingOperations.pop();
            
            // If there's no undoStack or it's a new sequence of undo operations,
            // create a new array in the undo stack
            if (!undoStack.length || undoStack[undoStack.length - 1].constructor !== Array) {
                undoStack.push([]);
            }
            
            // Add the operation to the undo stack
            undoStack[undoStack.length - 1].unshift(lastOperation);
            
            // Redraw the canvas with remaining operations
            redrawVisibleAnnotations();
        } else {
        }
    }
    
    // Redo the last undone operation
    function redoOperation() {
        if (undoStack.length > 0 && undoStack[undoStack.length - 1].length > 0) {
            // Get the last undo stack (which is an array of operations)
            const lastUndoStack = undoStack[undoStack.length - 1];
            
            // Take the first operation from the undo stack and add it back to drawing operations
            const operationToRedo = lastUndoStack.shift();
            drawingOperations.push(operationToRedo);
            
            // If the undo stack is now empty, remove it
            if (lastUndoStack.length === 0) {
                undoStack.pop();
            }
            
            // Redraw the canvas with the restored operation
            redrawVisibleAnnotations();
        } else {
        }
    }

    function handleResize() { // MODIFIED
        if (!canvas || !ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // If toolbar goes off screen after resize, reset its position
        const toolbar = document.getElementById(TOOLBAR_ID);
        if (toolbar) {
            const rect = toolbar.getBoundingClientRect();
            // If toolbar is off-screen, reposition it
            if (rect.right > window.innerWidth || rect.bottom > window.innerHeight || 
                rect.left < 0 || rect.top < 0) {
                // Check screen width to determine optimal placement
                if (window.innerWidth <= 480) {
                    // For very small screens, position at bottom
                    toolbar.style.left = '10px';
                    toolbar.style.right = '10px';
                    toolbar.style.top = 'auto';
                    toolbar.style.bottom = '10px';
                    toolbar.style.transform = 'none'; 
                } else {
                    // For larger screens, center at top
                    toolbar.style.left = '50%';
                    toolbar.style.top = '20px';
                    toolbar.style.transform = 'translateX(-50%)'; 
                }
            }
        }

        applyToolSettings(); // Re-apply settings like line width, color
        redrawVisibleAnnotations(); // Redraw with new dimensions and scroll position
    }

    function handleKeyPress(e) {
        if (e.key === "Escape" && currentTool !== 'navigate') {
            selectTool('navigate');
            e.preventDefault();
        }
        // Add more hotkeys here if desired
        // e.g. 'p' for pen, 'l' for line, etc.
        // if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return; // Don't hijack typing
    }

    // --- Text Tool Specific Functions ---
    function handleTextToolClick(x, y) {
        // Remove any existing input field first
        const existingInput = document.getElementById(`${PREFIX}text-input`);
        if (existingInput) {
            drawTextAndRemoveInput(existingInput, false); // Remove without drawing if user clicks elsewhere to start new text
        }

        // Create a textarea instead of input for better multi-line text support
        const input = document.createElement('textarea');
        input.id = `${PREFIX}text-input`;
        input.className = `${PREFIX}text-input`;
        input.placeholder = 'Type your text here...'; 
        
        // Since we're using fixed positioning for the input but document coordinates for the click,
        // we need to convert document coordinates to viewport coordinates
        const viewportX = x - window.scrollX; // Convert document X to viewport X
        const viewportY = y - window.scrollY; // Convert document Y to viewport Y
        
        // Adjust for better positioning (centered on the click point)
        const inputWidth = 150; // Smaller default width
        const inputHeight = 40; // Set a reasonable default height
        const adjustedX = Math.max(0, viewportX - (inputWidth / 2));
        const adjustedY = Math.max(0, viewportY - (inputHeight / 2));
        
        // Position element in viewport coordinates since it has fixed positioning
        input.style.left = `${adjustedX}px`;
        input.style.top = `${adjustedY}px`;


        // Auto-remove and draw on blur or Enter key
        input.addEventListener('blur', () => {
            // Give a small delay before removing to allow for other interactions
            setTimeout(() => {
                if (document.body.contains(input)) {
                    drawTextAndRemoveInput(input, true);
                }
            }, 100);
        });
        
        input.addEventListener('keydown', (e) => {
            // Enter without shift should confirm
            if (e.key === 'Enter' && !e.shiftKey) {
                drawTextAndRemoveInput(input, true);
                e.preventDefault(); // Prevent newline insertion
            } 
            // Shift+Enter allows for multi-line text
            else if (e.key === 'Escape') {
                drawTextAndRemoveInput(input, false);
                e.preventDefault();
            }
        });

        document.body.appendChild(input);
        
        // Force focus with a small delay to ensure it works across browsers
        setTimeout(() => {
            input.focus();
            // Ensure the textarea has the correct size based on content
            input.style.height = 'auto';
        }, 10);
    }

    function drawTextAndRemoveInput(inputElement, drawIt) {
        if (!inputElement) return;
        const text = inputElement.value.trim();

        // The x, y are document-relative from where the input was placed.
        const docX = parseFloat(inputElement.style.left);
        const docY = parseFloat(inputElement.style.top); // This is the top of the input.

        if (drawIt && text) {
            // Split text by newlines to handle multi-line text
            const textLines = text.split('\n');
            const fontSize = 18; // Slightly larger font for better readability
            const lineHeight = fontSize * 1.2; // Standard line height
            
            // Use the exact click coordinates for text placement
            // Unmodified x and y coordinates directly from the click event
            // Note: we want the real document coordinates to match where user clicked
            // These are the exact document coordinates where user originally clicked (startX, startY)
            // not the adjusted position of the input element
        
            // For each line of text, create a separate text operation
            textLines.forEach((line, index) => {
                if (line.trim()) { // Only add non-empty lines
                    const textOperation = {
                        tool: 'text',
                        text: line,
                        x: startX, // Original document-relative X where the user clicked
                        y: startY + (index * lineHeight), // Original Y position + line offset
                        color: currentColor, // Use the color active when text input was initiated
                        font: `${fontSize}px Arial, sans-serif`, // More readable font
                        lineHeight: lineHeight
                    };
                    drawingOperations.push(textOperation);
                }
            });
        }

        // Remove the input element smoothly
        inputElement.style.opacity = '0';
        setTimeout(() => {
            if (document.body.contains(inputElement)) {
                inputElement.remove();
            }
        }, 200);

        if (drawIt && text) {
            // Redraw everything now that new text operations are stored
            redrawVisibleAnnotations();
        }
    }

    // Get session ID from browser.webfuseSession API
    async function getSessionId() {
        try {
            const sessionInfo = await browser.webfuseSession.getSessionInfo();
            console.log('Session info:', sessionInfo);
            return sessionInfo.sessionId || '';
        } catch (e) {
            console.error('Error getting session ID:', e);
            return '';
        }
    }
    
    // Create invite dialog with session ID
    async function createInviteDialog() {
        // Remove existing dialog if any
        removeInviteDialog();
        
        // Create modal container
        const modalContainer = document.createElement('div');
        modalContainer.id = INVITE_DIALOG_ID;
        modalContainer.className = `${PREFIX}modal-container`;
        
        // Modal content
        const modalContent = document.createElement('div');
        modalContent.className = `${PREFIX}modal-content`;
        
        // Create header with title and close button
        const header = document.createElement('div');
        header.className = `${PREFIX}modal-header`;
        
        const title = document.createElement('h3');
        title.textContent = 'Invite to live session';
        
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.className = `${PREFIX}modal-close`;
        closeButton.addEventListener('click', removeInviteDialog);
        
        header.appendChild(title);
        header.appendChild(closeButton);
        
        // Create URL display area
        const urlContainer = document.createElement('div');
        urlContainer.className = `${PREFIX}invite-url-container`;
        
        // URL input field - initially shows loading
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.value = 'Getting session ID...';
        urlInput.className = `${PREFIX}invite-url-input`;
        urlInput.readOnly = true;
        
        // Copy button
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy';
        copyButton.className = `${PREFIX}invite-copy-button`;
        copyButton.disabled = true; // Disabled until we have the session ID
        copyButton.addEventListener('click', () => {
            urlInput.select();
            document.execCommand('copy');
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
                copyButton.textContent = 'Copy';
            }, 2000);
        });
        
        urlContainer.appendChild(urlInput);
        urlContainer.appendChild(copyButton);
        
        modalContent.appendChild(header);
        modalContent.appendChild(urlContainer);
        
        modalContainer.appendChild(modalContent);
        document.body.appendChild(modalContainer);
        
        // Get session ID and update URL
        try {
            const sessionId = await getSessionId();
            if (sessionId) {
                const inviteUrl = INVITE_URL_BASE + sessionId;
                urlInput.value = inviteUrl;
                copyButton.disabled = false;
                
                // Focus the input for easy selection
                setTimeout(() => {
                    urlInput.focus();
                    urlInput.select();
                }, 100);
            } else {
                urlInput.value = 'Could not get session ID';
                copyButton.disabled = true;
            }
        } catch (error) {
            console.error('Error in createInviteDialog:', error);
            urlInput.value = 'Error getting session ID';
        }
    }
    
    function removeInviteDialog() {
        const existingDialog = document.getElementById(INVITE_DIALOG_ID);
        if (existingDialog) {
            existingDialog.remove();
        }
    }
    
    function handleInviteButtonClick() {
        // Always select navigate tool when invite button is clicked
        selectTool('navigate');
        createInviteDialog().catch(error => {
            console.error('Error creating invite dialog:', error);
        });
    }
    
    function injectInviteDialogStyles() {
        const styleId = `${PREFIX}invite-dialog-styles`;
        
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .${PREFIX}modal-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 2147483648;
            }
            
            .${PREFIX}modal-content {
                background-color: white;
                padding: 20px;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                width: 90%;
                max-width: 500px;
            }
            
            .${PREFIX}modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .${PREFIX}modal-header h3 {
                margin: 0;
                font-size: 18px;
            }
            
            .${PREFIX}modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                margin: 0;
            }
            
            .${PREFIX}invite-url-container {
                display: flex;
                margin-bottom: 10px;
            }
            
            .${PREFIX}invite-url-input {
                flex-grow: 1;
                padding: 8px;
                border: 1px solid #ccc;
                border-radius: 4px 0 0 4px;
            }
            
            .${PREFIX}invite-copy-button {
                padding: 8px 12px;
                background-color: #6200d9;
                color: white;
                border: none;
                border-radius: 0 4px 4px 0;
                cursor: pointer;
            }
            
            .${PREFIX}invite-copy-button:hover {
                background-color: #5000b0;
            }
            
            .${PREFIX}share-url-container {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .${PREFIX}share-url-container > div {
                display: flex;
                align-items: center;
            }
            
            .${PREFIX}share-resolution-info {
                font-size: 12px;
                color: #666;
                margin: 0 0 5px 0;
                text-align: center;
            }
            
            .${PREFIX}share-url-input {
                flex-grow: 1;
                padding: 8px;
                border: 1px solid #ccc;
                border-radius: 4px;
                margin-right: 8px;
            }
            
            .${PREFIX}share-copy-button {
                padding: 8px 12px;
                background-color: #6200d9;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                min-width: 60px;
            }
            
            .${PREFIX}share-copy-button:hover {
                background-color: #5000b0;
            }
            
            .${PREFIX}share-copy-button:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    // Inject invite dialog styles when script is loaded
    injectInviteDialogStyles();

    // Share annotation functions
    async function saveAnnotationsToWorker(id, annotations) {
        try {
            const response = await fetch(`${SHARE_API_BASE}${id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(annotations)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return true;
        } catch (error) {
            console.error('Error saving annotations:', error);
            return false;
        }
    }

    async function loadAnnotationsFromWorker(id) {
        try {
            const response = await fetch(`${SHARE_API_BASE}${id}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error loading annotations:', error);
            return null;
        }
    }

    function createShareDialog() {
        // Remove existing dialog if any
        removeShareDialog();
        
        // Check if there are any drawings
        if (drawingOperations.length === 0) {
            // Show message to draw first
            const messageDialog = document.createElement('div');
            messageDialog.id = SHARE_DIALOG_ID;
            messageDialog.className = `${PREFIX}modal-container`;
            messageDialog.innerHTML = `
                <div class="${PREFIX}modal-content">
                    <div class="${PREFIX}modal-header">
                        <h3>No Annotations to Share</h3>
                        <button class="${PREFIX}modal-close">&times;</button>
                    </div>
                    <p>Please draw some annotations first before sharing.</p>
                </div>
            `;
            
            document.body.appendChild(messageDialog);
            
            messageDialog.querySelector(`.${PREFIX}modal-close`).addEventListener('click', removeShareDialog);
            messageDialog.addEventListener('click', (e) => {
                if (e.target === messageDialog) removeShareDialog();
            });
            
            return;
        }
        
        // Create modal container
        const modalContainer = document.createElement('div');
        modalContainer.id = SHARE_DIALOG_ID;
        modalContainer.className = `${PREFIX}modal-container`;
        
        // Modal content
        const modalContent = document.createElement('div');
        modalContent.className = `${PREFIX}modal-content`;
        
        // Create header with title and close button
        const header = document.createElement('div');
        header.className = `${PREFIX}modal-header`;
        
        const title = document.createElement('h3');
        title.textContent = 'Share Annotations';
        
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.className = `${PREFIX}modal-close`;
        closeButton.addEventListener('click', removeShareDialog);
        
        header.appendChild(title);
        header.appendChild(closeButton);
        
        // Create URL display area
        const urlContainer = document.createElement('div');
        urlContainer.className = `${PREFIX}share-url-container`;
        
        // Resolution info
        const resolutionInfo = document.createElement('p');
        resolutionInfo.className = `${PREFIX}share-resolution-info`;
        resolutionInfo.textContent = `Created for ${window.innerWidth}x${window.innerHeight} resolution`;
        
        // URL input field - initially shows loading
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.value = 'Generating share URL...';
        urlInput.className = `${PREFIX}share-url-input`;
        urlInput.readOnly = true;
        
        // Copy button
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy';
        copyButton.className = `${PREFIX}share-copy-button`;
        copyButton.disabled = true;
        copyButton.addEventListener('click', () => {
            urlInput.select();
            navigator.clipboard.writeText(urlInput.value).then(() => {
                copyButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                }, 2000);
            }).catch(() => {
                // Fallback for older browsers
                document.execCommand('copy');
                copyButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                }, 2000);
            });
        });
        
        const inputGroup = document.createElement('div');
        inputGroup.appendChild(urlInput);
        inputGroup.appendChild(copyButton);
        
        urlContainer.appendChild(resolutionInfo);
        urlContainer.appendChild(inputGroup);
        
        modalContent.appendChild(header);
        modalContent.appendChild(urlContainer);
        
        modalContainer.appendChild(modalContent);
        document.body.appendChild(modalContainer);
        
        // Close on background click
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) removeShareDialog();
        });
        
        // Generate share URL
        generateShareUrl(urlInput, copyButton);
    }

    async function generateShareUrl(urlInput, copyButton) {
        try {
            const id = generateShortId();
            const width = window.innerWidth;
            
            // Save annotations to worker
            const success = await saveAnnotationsToWorker(id, drawingOperations);
            
            if (success) {
                // Create encoded string: current_url#ant=width=id
                const currentUrl = window.location.href.split('#')[0]; // Remove existing hash
                const dataToEncode = currentUrl + '#ant=' + `${width}=${id}`;
                const encodedString = btoa(dataToEncode);
                const shareUrl = `https://annotateweb.com/?view=${encodedString}`;
                
                urlInput.value = shareUrl;
                copyButton.disabled = false;
                
                // Focus and select the input
                setTimeout(() => {
                    urlInput.focus();
                    urlInput.select();
                }, 100);
            } else {
                urlInput.value = 'Error generating share URL';
                copyButton.disabled = true;
            }
        } catch (error) {
            console.error('Error in generateShareUrl:', error);
            urlInput.value = 'Error generating share URL';
            copyButton.disabled = true;
        }
    }

    function removeShareDialog() {
        const existingDialog = document.getElementById(SHARE_DIALOG_ID);
        if (existingDialog) {
            existingDialog.remove();
        }
    }

    function handleShareButtonClick() {
        selectTool('navigate');
        createShareDialog();
    }

    // Parse URL hash for shared annotations
    function parseUrlHash() {
        const hash = window.location.hash;
        if (hash.startsWith('#ant=')) {
            const params = hash.substring(5); // Remove '#ant='
            const parts = params.split('=');
            if (parts.length === 2) {
                const width = parseInt(parts[0]);
                const id = parts[1];
                return { width, id };
            }
        }
        return null;
    }

    // Load shared annotations
    async function loadSharedAnnotations() {
        const hashParams = parseUrlHash();
        if (hashParams) {
            const { width, id } = hashParams;
            console.log(`Loading shared annotations: width=${width}, id=${id}`);
            
            try {
                const annotations = await loadAnnotationsFromWorker(id);
                if (annotations && Array.isArray(annotations)) {
                    // Clear existing annotations
                    drawingOperations = [];
                    undoStack = [];
                    
                    // Load the shared annotations
                    drawingOperations = annotations;
                    
                    // Redraw the annotations
                    redrawVisibleAnnotations();
                    
                    console.log(`Loaded ${annotations.length} shared annotations`);
                } else {
                    console.warn('No annotations found for ID:', id);
                }
            } catch (error) {
                console.error('Error loading shared annotations:', error);
            }
        }
    }
    
    function injectExportDialogStyles() {
        if (document.getElementById('dt-export-styles')) return;
        const style = document.createElement('style');
        style.id = 'dt-export-styles';
        style.textContent = `
            #${EXPORT_DIALOG_ID} {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: white;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 25px;
                z-index: 2147483647; /* Max z-index */
                box-shadow: 0 6px 12px rgba(0,0,0,0.15);
                text-align: center;
                font-family: Arial, sans-serif;
            }
            #${EXPORT_DIALOG_ID} h3 {
                margin-top: 0;
                margin-bottom: 15px;
                color: #333;
            }
            #${EXPORT_DIALOG_ID} button {
                margin: 8px;
                padding: 10px 20px;
                cursor: pointer;
                border: none;
                border-radius: 5px;
                font-size: 14px;
                transition: background-color 0.2s ease;
            }
            #${EXPORT_DIALOG_ID} button.dt-export-visible,
            #${EXPORT_DIALOG_ID} button.dt-export-full {
                background-color: #007bff;
                color: white;
            }
            #${EXPORT_DIALOG_ID} button.dt-export-visible:hover,
            #${EXPORT_DIALOG_ID} button.dt-export-full:hover {
                background-color: #0056b3;
            }
            #${EXPORT_DIALOG_ID} button.dt-export-cancel {
                background-color: #6c757d;
                color: white;
            }
            #${EXPORT_DIALOG_ID} button.dt-export-cancel:hover {
                background-color: #545b62;
            }
        `;
        document.head.appendChild(style);
    }

    injectExportDialogStyles(); // Inject styles when this part of the script is parsed

    function removeExportChoiceDialog() {
        const dialog = document.getElementById(EXPORT_DIALOG_ID);
        if (dialog) {
            dialog.remove();
        }
    }

    async function capturePageAndDownload(captureType) {
        removeExportChoiceDialog(); // Remove dialog once a choice is made

        const toolbar = document.getElementById(TOOLBAR_ID);
        let wasToolbarVisible = false;
        if (toolbar) {
            wasToolbarVisible = toolbar.style.display !== 'none';
            toolbar.style.display = 'none';
        }
        if (canvas) canvas.style.border = 'none'; // Temporarily remove canvas border

        try {
            let targetElement;
            let html2canvasOptions = {
                useCORS: true,
                logging: true, // Set to false in production if not needed
                allowTaint: false, // Recommended to be false with useCORS: true
                onclone: (clonedDoc) => {
                    const clonedDrawingCanvas = clonedDoc.getElementById(CANVAS_ID);
                    if (clonedDrawingCanvas) {
                        clonedDrawingCanvas.style.zIndex = '2147483647'; // Ensure it's on top
                    } else {
                        console.warn('Drawing canvas NOT found in cloned document.');
                    }

                    // NEW: For full page export, ensure the cloned document is at the very top
                    if (html2canvasOptions.windowHeight === clonedDoc.documentElement.scrollHeight) { // Heuristic: this onclone is for full page
                        clonedDoc.documentElement.scrollTop = 0;
                        clonedDoc.body.scrollTop = 0;
                        clonedDoc.documentElement.style.marginTop = '0px';
                        clonedDoc.documentElement.style.paddingTop = '0px';
                        clonedDoc.body.style.marginTop = '0px';
                        clonedDoc.body.style.paddingTop = '0px';
                    }
                }
            };

            if (captureType === 'full') {
                targetElement = document.documentElement;
                // Ensure html2canvas captures the entire scrollable area by setting window dimensions
                html2canvasOptions.windowWidth = document.documentElement.scrollWidth;
                html2canvasOptions.windowHeight = document.documentElement.scrollHeight;
                // Explicitly set capture origin for full page
                html2canvasOptions.x = 0;
                html2canvasOptions.y = 0;
                html2canvasOptions.scrollX = 0; // Ensure no scroll offset is internally applied by html2canvas
                html2canvasOptions.scrollY = 0;
            } else { // 'visible'
                targetElement = document.documentElement; // Use documentElement for consistency
                html2canvasOptions.x = window.scrollX;
                html2canvasOptions.y = window.scrollY;
                html2canvasOptions.width = document.documentElement.clientWidth;
                html2canvasOptions.height = document.documentElement.clientHeight;
                html2canvasOptions.windowWidth = document.documentElement.clientWidth;
                html2canvasOptions.windowHeight = document.documentElement.clientHeight;
            }

            // Note: JSON.stringify won't show functions like onclone, but useful for other props.

            const capturedCanvas = await html2canvas(targetElement, html2canvasOptions);

            // NEW: Draw annotations onto the captured canvas for full page exports
            if (captureType === 'full') {
                const capturedCtx = capturedCanvas.getContext('2d');
                // For full page, coordinates are already document-relative, so offsets are 0,0
                drawAnnotationsOnCanvas(capturedCtx, drawingOperations, 0, 0);
            } else if (captureType === 'visible') {
                // For visible area, html2canvas captures a portion. Annotations need to be drawn
                // relative to that captured portion. Since html2canvas options.x/y are used,
                // the drawingOperations (document-relative) need to be offset by these same values.
                const capturedCtx = capturedCanvas.getContext('2d');
                drawAnnotationsOnCanvas(capturedCtx, drawingOperations, html2canvasOptions.x, html2canvasOptions.y);
            }

            const timestamp = new Date().toISOString().replace(/[\:\.]/g, '-');
            const filename = `screenshot-${captureType}-${timestamp}.png`;

            const link = document.createElement('a');
            link.download = filename;
            link.href = capturedCanvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('Error during html2canvas capture or download:', error);
            alert(`Failed to export image: ${error.message || error}`);
        } finally {
            if (toolbar && wasToolbarVisible) {
                toolbar.style.display = ''; // Restore toolbar
            }
            if (canvas) canvas.style.border = '1px solid #ccc'; // Restore canvas border (or originalStyle.border)
        }
    }

    async function exportCanvasAsImage() {
        removeExportChoiceDialog();

        const dialog = document.createElement('div');
        dialog.id = EXPORT_DIALOG_ID;
        dialog.innerHTML = `
            <h3>Export Image</h3>
            <p>Choose capture area:</p>
            <button class="dt-export-visible">Visible Area</button>
            <button class="dt-export-full">Full Page</button>
            <button class="dt-export-cancel">Cancel</button>
        `;
        document.body.appendChild(dialog);

        dialog.querySelector('.dt-export-visible').addEventListener('click', () => {
            capturePageAndDownload('visible');
        });

        dialog.querySelector('.dt-export-full').addEventListener('click', () => {
            capturePageAndDownload('full');
        });

        dialog.querySelector('.dt-export-cancel').addEventListener('click', () => {
            removeExportChoiceDialog();
        });
    }
    // --- Initialization ---
    function init() {
        addStyles();
        createToolbar();
        createCanvas(); // Canvas is now fixed, viewport-sized
        addGlobalDragListeners(); // Add listeners for toolbar dragging
        selectTool('navigate'); // Default to navigation

        window.addEventListener('resize', handleResize);
        window.addEventListener('keydown', handleKeyPress); // For Esc key
        window.addEventListener('scroll', redrawVisibleAnnotations, { passive: true }); // NEW: Redraw on scroll, use passive listener

        document.getElementById(TOOLBAR_ID).addEventListener('dragstart', (e) => e.preventDefault());

        // Add listener for the new export button
        const exportButton = document.getElementById(`${PREFIX}export-button`);
        if (exportButton) {
            exportButton.addEventListener('click', exportCanvasAsImage);
        } else {
            console.warn('Export button not found during init.');
        }
        
        // Add listener for the invite button
        const inviteButton = document.getElementById(`${PREFIX}invite-button`);
        if (inviteButton) {
            inviteButton.addEventListener('click', handleInviteButtonClick);
        } else {
            console.warn('Invite button not found during init.');
        }
        
        // Add listener for the share button
        const shareButton = document.getElementById(`${PREFIX}share-button`);
        if (shareButton) {
            shareButton.addEventListener('click', handleShareButtonClick);
        } else {
            console.warn('Share button not found during init.');
        }
    }

    function redrawVisibleAnnotations() {
        if (!canvas || !ctx) return;

        // Clear the entire viewport canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const viewportX = window.scrollX;
        const viewportY = window.scrollY;


        drawingOperations.forEach(op => {
            // Apply common styles for this operation
            ctx.strokeStyle = op.color;
            ctx.fillStyle = op.color; // For text and filled shapes (if any)
            ctx.lineWidth = op.lineWidth;
            ctx.globalCompositeOperation = op.compositeOperation || 'source-over'; // Default to source-over

            // Convert document-relative coordinates to viewport-relative for drawing
            ctx.beginPath();

            if (op.tool === 'pen' || op.tool === 'eraser' || op.tool === 'highlight') {
                if (op.points && op.points.length > 0) {
                    const firstPoint = op.points[0];
                    ctx.moveTo(firstPoint.x - viewportX, firstPoint.y - viewportY);
                    for (let i = 1; i < op.points.length; i++) {
                        const point = op.points[i];
                        ctx.lineTo(point.x - viewportX, point.y - viewportY);
                    }
                    ctx.stroke();
                }
            } else if (op.tool === 'rectangle') {
                ctx.strokeRect(
                    op.startX - viewportX,
                    op.startY - viewportY,
                    op.endX - op.startX, // width
                    op.endY - op.startY  // height
                );
            } else if (op.tool === 'line') {
                ctx.moveTo(op.startX - viewportX, op.startY - viewportY);
                ctx.lineTo(op.endX - viewportX, op.endY - viewportY);
                ctx.stroke();
            } else if (op.tool === 'circle') {
                ctx.arc(
                    op.centerX - viewportX,
                    op.centerY - viewportY,
                    op.radius,
                    0,
                    2 * Math.PI
                );
                ctx.stroke();
            } else if (op.tool === 'text') {
                ctx.font = op.font || '18px Arial, sans-serif';
                ctx.textBaseline = 'top'; // Set text baseline for more predictable positioning
                
                // Add a subtle text shadow effect for better readability over different backgrounds
                ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
                ctx.shadowBlur = 3;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                
                // Draw the text with adjusted positioning
                ctx.fillText(op.text, op.x - viewportX, op.y - viewportY);
                
                // Reset shadow for other drawing operations
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }
            // ctx.closePath(); // Not strictly necessary for stroke/fill as they handle paths.
        });

        // Reset composite operation after drawing everything, so UI elements like toolbar are not affected.
        ctx.globalCompositeOperation = 'source-over';
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
        // Load shared annotations if URL hash is present
        setTimeout(loadSharedAnnotations, 100);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            init();
            // Load shared annotations if URL hash is present
            setTimeout(loadSharedAnnotations, 100);
        });
    }

})();