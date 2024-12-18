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
        
        try {
            const response = await fetch(`${this.config.url}/${this.config.app}/${entity}.json`, {
                method: 'PUT',
                headers: {
                    'X-Custom-Auth-Key': `${this.config.token}`
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) throw new Error('Sync failed');
            return true;
        } catch (error) {
            console.error('R2 sync failed:', error);
            return false;
        }
    }

    // 从R2加载数据
    async loadFromR2(entity = 'todos') {
        if (!this.config.enabled) return null;
        
        try {
            const response = await fetch(`${this.config.url}/${this.config.app}/${entity}.json`, {
                headers: {
                    'X-Custom-Auth-Key': `${this.config.token}`
                }
            });
            
            if (!response.ok) throw new Error('Load failed');
            return await response.json();
        } catch (error) {
            console.error('R2 load failed:', error);
            return null;
        }
    }

    // 创建配置对话框
    createConfigDialog(onSave) {
        const configDialog = document.createElement("div");
        configDialog.className = "config-dialog";
        configDialog.innerHTML = `
            <h2>R2 配置</h2>
            <label>
                启用R2同步
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
            <button id="save-config">保存</button>
            <button id="close-config">关闭</button>
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