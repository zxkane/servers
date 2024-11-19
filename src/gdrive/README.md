# Google Drive server

This MCP server integrates with Google Drive to allow listing, reading, and searching over files.

## Getting started

1. Create a new Google Cloud project
2. Enable the Google Drive API
3. Configure an OAuth consent screen ("internal" is fine for testing)
4. Add OAuth scope `https://www.googleapis.com/auth/drive.readonly`
5. Create an OAuth Client ID for application type "Desktop App"
6. Download the JSON file of your client's OAuth keys
7. Rename the key file to `gcp-oauth.keys.json` and place into the root of this repo

Make sure to build the server with either `npm run build` or `npm run watch`.

### Authentication

To authenticate and save credentials:

1. Run the server with the `auth` argument: `node build/gdrive auth`
2. This will open an authentication flow in your system browser
3. Complete the authentication process
4. Credentials will be saved for future use

### Running the server

After authenticating:

1. Run the server normally: `node build/gdrive`
2. The server will load the saved credentials and start

Note: If you haven't authenticated yet, the server will prompt you to run with the `auth` argument first.
