// r2-sync.js

export class R2Sync {
    constructor() {
        this.config = {
            app: '',
            url: '',
            token: '',
            enabled: false
        };
        this.loadConfig();
    }

    // 加载配置
    loadConfig() {
        const stored = localStorage.getItem('r2Config');
        if (stored) {
            this.config = JSON.parse(stored);
        }
    }

    // 保存配置
    saveConfig() {
        localStorage.setItem('r2Config', JSON.stringify(this.config));
    }

    // 更新配置
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
    }

    // 同步数据到R2
    async syncToR2(data, entity = 'todos') {
        if (!this.config.enabled) return;
        
        // Create a zip file
        const zip = new JSZip();
        
        // Add files to zip
        const jsonString = JSON.stringify(data);
        zip.file(entity, jsonString);
        
        // Generate zip content
        const zipContent = await zip.generateAsync({type: "blob"});
        
        try {
            await fetch(`${this.config.url}/${this.config.app}/${entity}.zip`, {
                method: 'PUT',
                headers: {
                    'X-Custom-Auth-Key': `${this.config.token}`
                },
                body: zipContent
            });
        } catch (error) {
            console.error('Upload failed:', error);
        }
    }

    // 从R2加载数据
    async loadFromR2(entity = 'todos') {
        if (!this.config.enabled) return null;
        
        try {
            const response = await fetch(`${this.config.url}/${this.config.app}/${entity}.zip`, {
                headers: {
                    'X-Custom-Auth-Key': `${this.config.token}`
                }
            });
            
            if (!response.ok) return null;
            
            // Get zip file blob
            const zipBlob = await response.blob();
            
            // Load and parse zip
            const zip = new JSZip();
            const contents = await zip.loadAsync(zipBlob);
            
            // Extract files
            const files = [];
            for (let filename in contents.files) {
                const content = await contents.files[filename].async("string");
                files.push({
                    name: filename,
                    content: content
                });
            }
            
            return JSON.parse(files[0].content);
        } catch (error) {
            console.error('Download failed:', error);
            return null;
        }
    }

    // 创建配置对话框
    createConfigDialog(onSave) {
        const configDialog = document.createElement("div");
        configDialog.className = "config-dialog";
        configDialog.innerHTML = `
            <h2>R2 Config</h2>
            <label>
                Enable R2 sync
                <input type="checkbox" id="r2-enabled" ${this.config.enabled ? 'checked' : ''}>
            </label>
            <label>
                App
                <input type="text" id="app" value="${this.config.app}">
            </label>
            <label>
                URL
                <input type="text" id="url" value="${this.config.url}">
            </label>
            <label>
                Token
                <input type="text" id="token" value="${this.config.token}">
            </label>
            <button id="save-config">Save</button>
            <button id="close-config">Close</button>
        `;

        document.body.appendChild(configDialog);

        document.getElementById("save-config").addEventListener("click", () => {
            const newConfig = {
                enabled: document.getElementById("r2-enabled").checked,
                app: document.getElementById("app").value,
                url: document.getElementById("url").value,
                token: document.getElementById("token").value,
            };
            this.updateConfig(newConfig);
            if (onSave) onSave();
            configDialog.remove();
        });

        document.getElementById("close-config").addEventListener("click", () => {
            configDialog.remove();
        });
    }
}