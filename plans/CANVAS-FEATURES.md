# Canvas Feature Branch

This is for a canvas layout for tour playback. This would allow more flexibility in displaying links to code from the central diagram.

1: A canvas layout that allows the user to see more flexible relationships between diagram and code.
2: This is for the viewer.
3: Web player.
4: Deliverables are below.
5: One hard constraint is that browser testing with Playwright is required, and testing must cover as much code as possible.

Update AGENTS.md and CONTEXT.md as needed. Create issues in ./issues/ the same was as the bunbun project in /Users/ajc/Projects/codegens/bunbun
Use memory and code indexing to keep work efficient. Use subagents with worktrees when possible.

Deliverables:
  - a canvas layout something like the attached picture, but also search the web for examples of canvas layouts that show relationships between diagrams and code.
  - The canvas layout will be responsive and smooth as a priority. The aim is for 60 frames per second with no shuddering, skipping, or pauses.
  - HCI best practices will be followed.
  - Accessibility will be maintained
    - there must be support for screen readers
    - high contrast colour schemes
    - colour blindness colour schemes
    - large text sizes
  - Clicking a decision shape in the diagram will show a line that goes to a new container with the highlighted code.
  - Multiple diagrams can be displayed, showing relationships between 2 modules for example.
  - Every code container will have "incoming links" and "outgoing links" buttons.
  - Toggling these buttons will show the code that calls the current container for incoming, and for outgoing will show what this current container code calls.
  - A line is drawn from the diagram object to the specific code that it refers to, with a fainter, thicker line from container to container.
  - Lines are drawn straight horizontal and vertical with right angles that have small 90 degree curves. Unless HCI guidelines say to use something different.
  - Each object name, class, functions, etc, will allow the user to click on it to draw a new line to the definition of that object.
  - The canvas view will have a full screen button that allows the user to toggle between full screen and windowed view.
  - When going to full screen, the full screen button will be highlighted for a short period of time, with a message saying "click here to get back to windowed mode, or use the shortcut key <shortcut>". Shortcut key not yet defined, need to make one.
  - When new containers are opened from diagrams or code, the canvas zoom will resize to show the diagram and the new containers. This will be a user preference that is explained to the user with a floating short lived message the first time it is performed, with an undo button to return to the previous view. The message will also have a "disable this for me" which toggles the zoom preference to OFF without leaving the view or showing preferences view. The message will confirm that the preference is disabled for the user.
  - The canvas view will have buttons that:
    - can fit all containers to screen
    - auto-arrange containers
    - return to home (the diagram).
    - Zoom in and out buttons with a reset zoom level button.
    - (more as we discover how the canvas looks)
  - The containers will auto-arrange, with a user preference controlling whether that happens. When the auto-arrange happens for the first time, a message will be shown explaining where in preferences that can be toggled, and have an undo button to go back to the previous arrangement. The message will also have a "disable this for me" which toggles the auto-layout preference to OFF without leaving the view or showing preferences view. The message will confirm that the preference is disabled for the user.
  - Keyboard navigation will work
    - When a container is selected+highlighted, enter will move the selector inside the container.
      - Once inside a container, arrow keys will navigate keywords or diagram components.
      - Enter will link to the definition or incoming/outgoing object.
      - Escape will return to the container selection+highlight.
    - Arrow keys will move the selection+highlight to different containers.
    - HJKL vim navigation keys will also work.
    - Escape will return the selection+highlight to the central diagram.
  - The user will be able to export a layout to PDF, PNG, and JPG.
    - Either export as-is, or as a print-specific layout that better shows the code
  - Other best practice features of canvasses should be researched and presented as optional during roadmap planning.