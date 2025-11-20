# AnnotateWeb.com

`annotateweb.com` is a web annotation and collaboration tool for drawing, highlighting, and commenting on live websites. It requires no installation for the end-user. This repository holds the client-side code for the annotation functionality.

---

## Core Mechanism: Webfuse Integration

`annotateweb.com` is a Webfuse Session Extension, not a typical browser extension. Its operation depends on the Webfuse web augmentation platform.

1.  **Virtual Web Sessions:** Webfuse uses a proxy system to load the target website within a virtual session.
2.  **Real-time Augmentation:** The platform modifies the website's code (HTML, CSS, JS) before it reaches the browser.
3.  **Extension Injection:** It injects the `content.js` script into this session, granting it access to modify the page.

This proxy-based approach means no software or browser extension installation is needed for any user. It also bypasses common browser security policies, permitting augmentation on third-party websites.

---

## Functionality Overview

The `content.js` script adds a movable toolbar with several functions.

#### Annotation & Drawing Tools
*   **Navigate:** A mode for normal interaction with the underlying website.
*   **Drawing Primitives:** Includes a Pen, Line, Rectangle, and Circle for creating shapes.
*   **Highlighter:** Applies a semi-transparent layer to mark text or sections.
*   **Text Tool:** Adds text comments directly onto the page.
*   **Eraser:** Removes specific annotations.
*   **Style Controls:** Options for color and line width are available.
*   **History:** The toolbar includes Undo, Redo, and Clear functions.

#### Collaboration & Sharing
*   **Invite (Real-time Co-browsing):** Generates a unique URL for a shared session. Other participants who open the link can view annotations as they are made. This uses Webfuse's **Shared Space** and session management.
*   **Share (Static Snapshot):** Creates a link to a saved version of the annotations on the target page.
*   **Export to Image:** Captures the annotations as a PNG file. Options include exporting the visible area or the full scrollable page.

---

## Technical Overview

This section covers the code that provides the annotation functions.

### Repository Files

*   **`content.js`**: A Webfuse Session Extension written in JavaScript. It is responsible for:
    *   Rendering and managing the annotation toolbar UI.
    *   Handling drawing logic on an HTML `<canvas>` element.
    *   Storing annotation data (paths, shapes, text) with coordinates relative to the document's full scrollable size.
    *   Redrawing annotations correctly during user scrolling and window resizing.
    *   Using the Webfuse API (`browser.webfuseSession.getSessionInfo()`) for the "Invite" function.
    *   Communicating with a backend worker to save and load shared annotation snapshots.

*   **`html2canvas.min.js`**: A third-party library for the "Export to Image" function. It reads the DOM to render a screenshot onto a canvas.

*   **`manifest.json`**: A manifest file defines how the Webfuse platform loads the Session Extension and what permissions it has within the session environment.

### `content.js` Implementation Details

*   **Scrolling and Positioning**: The script distinguishes between the viewport (visible area) and the document (the entire page). Annotations are drawn on a fixed-position canvas that covers the viewport. The data for each drawing is stored using document-relative coordinates. When a user scrolls, the script clears the viewport canvas and redraws only the annotations that fall within the new visible area.

*   **State Management**: Drawing operations are stored in a `drawingOperations` array. The undo, redo, clear, and export functions operate by manipulating or re-playing the items in this array.

*   **Platform Integration**: The script calls `browser.webfuseSession.getSessionInfo()`. This is a Webfuse API injected into the session. This call retrieves the `sessionId`, which is a necessary component for creating the collaborative co-browsing link.
