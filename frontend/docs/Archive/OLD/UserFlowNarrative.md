# User Flow Narrative: Kanban-frontend Application Journey

This narrative outlines the complete user experience within the Kanban-frontend application, detailing key interactions and expected outcomes.

**I. Initial Access & Authentication**

1.  **Application Launch**: A user navigates to the application's URL (e.g., `localhost:5173`).
2.  **Login/Registration**:
    *   **New User**: The user, not having an account, clicks the "Sign Up" link. They are presented with a registration form where they enter their email address, create a password, and confirm it. Upon successful submission, their account is created, and they are either automatically logged in or prompted to log in with their new credentials.
    *   **Existing User**: The user, already having an account, enters their registered email and password into the respective fields on the login screen. They click the "Login" button. If credentials are correct, they are authenticated and proceed. If incorrect, an error message is displayed.

**II. Project Management Dashboard**

1.  **Dashboard View**: After logging in, the user is directed to the main Dashboard.
    *   If no projects exist, they are prompted to create their first project.
    *   If projects exist, a list of their projects is displayed, typically on a sidebar or a central project selection area.
2.  **Creating a New Project**:
    *   The user clicks a "Create New Project" button/link.
    *   A dialog or form appears, prompting for a project name, a brief description, and a unique project prefix (e.g., "KAN" for Kanban, "BUG" for Bug Tracker).
    *   Upon submission, the new project is created, and the user is automatically navigated to this new project's Kanban board.
3.  **Navigating Between Projects**: The user can select different projects from the sidebar navigation. Clicking a project name loads that project's Kanban board.

**III. Project Settings & Configuration**

1.  **Accessing Project Settings**: From a selected project's view, the user clicks "Settings" in the sidebar navigation.
2.  **Project Data Management**:
    *   **Editing Basic Info**: The user can modify the project's name, description, or prefix in the "Data" section. They click "Save changes" to apply updates or "Restore initial state" to revert.
    *   **Columns Configuration**: In the "Columns" section, the user manages the project's workflow stages (Kanban columns).
        *   They see a table listing existing columns (e.g., "TODO", "IN PROGRESS", "DONE").
        *   They can edit individual column names, types (e.g., "Start", "Middle", "End"), and colors.
        *   They can add new columns by clicking "+ Add new column" and providing the necessary details.
        *   Columns can be reordered (e.g., via drag-and-drop handles) to reflect workflow changes.
        *   Columns can be deleted by clicking a trash can icon.
        *   Changes are saved or reverted via "Save changes" and "Restore initial state" buttons.
3.  **Member Management**: The user navigates to the "Members" section within Project Settings.
    *   They view a list of current project members and their roles.
    *   They can invite new members by entering their email and assigning a role.
    *   They can remove existing members from the project.
4.  **Deleting a Project (Danger Zone)**: In the "Danger zone" section of Project Settings, the user can initiate project deletion. A confirmation step (e.g., requiring them to type the project name) prevents accidental deletion.

**IV. Task Management on the Kanban Board**

1.  **Viewing Tasks**: The Kanban board displays tasks organized within their respective columns. Each task is represented by a "tile" with key information (e.g., title, assignee, due date).
2.  **Creating a New Task**:
    *   The user clicks an "+ Add new task" button, typically found within each column header or a general board action.
    *   A task creation dialog appears, where they can input the task's title, a detailed description, assign it to a member, set a due date, add tags, and specify its initial column.
    *   Upon clicking "Add Task", the new task tile appears in the designated column.
3.  **Editing an Existing Task**:
    *   The user clicks on a task tile to open a detailed task dialog.
    *   They can modify any task attribute: title, description, assignee, due date, tags.
    *   They can add and view comments related to the task, and interact with related tasks (linking/unlinking).
    *   Changes are saved automatically or via a dedicated "Save" button.
4.  **Moving Tasks (Status Change)**:
    *   The user drags a task tile from one column and drops it into another.
    *   This action automatically updates the task's status (its assigned column).
5.  **Deleting a Task**: Within the detailed task dialog, a "Delete Task" option allows the user to remove the task from the project after a confirmation step.

**V. User Preferences**

1.  **Accessing Preferences**: The user clicks "Preferences" in the main sidebar.
2.  **Language Selection**:
    *   They see a dropdown for "Language".
    *   Selecting a different language (e.g., "English", "Polski") immediately updates the application's UI text to the chosen language.

**VI. Application-wide Interactions**

1.  **Sidebar Navigation**: The sidebar provides quick access to different sections of the application: Dashboard, Backlog, Members, Settings (project-specific), and global Preferences.
2.  **Logout**: The user clicks "Logout" in the sidebar to securely end their session and return to the login/registration screen. 