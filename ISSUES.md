# Known Issues & Development Notes

## npx command not found (Fixed in v1.2.5)

**Symptom:**
Users running `npx @nadimtuhin/ytranscript` encounter `sh: ytranscript: command not found`.

**Cause:**
npm/npx sometimes fails to preserve or correctly link executable permissions (`chmod +x`) from the published tarball, particularly for scoped packages with multiple binaries or when installing via `npx` cache.

**Solution:**
We implemented two fixes:
1.  **Strict Permissions:** Added a `postinstall` script to force `chmod +x` on binaries after installation.
    ```json
    "postinstall": "chmod +x dist/cli.js dist/mcp.js || true"
    ```
2.  **Bin Configuration:** Ensured `bin` entries in `package.json` use simple relative paths (`dist/cli.js`) to avoid npm warnings.

**Future Maintenance:**
*   **Do not remove the `postinstall` script.** It is critical for `npx` compatibility.
*   **Do not use `./` prefix in `bin` paths** in `package.json` if possible, as it triggers npm publish warnings.
