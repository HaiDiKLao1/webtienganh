const router = {
    // Hàm tải một trang con vào khu vực content
    async loadPage(pageUrl, containerId = 'main-content') {
        try {
            const response = await fetch(pageUrl);
            if (!response.ok) throw new Error(`Không tìm thấy trang: ${pageUrl}`);
            
            const html = await response.text();
            document.getElementById(containerId).innerHTML = html;
            
            // Tìm và thực thi các thẻ <script> trong nội dung HTML vừa load (nếu có)
            this.executeScripts(document.getElementById(containerId));
        } catch (error) {
            console.error('Lỗi Router:', error);
            document.getElementById(containerId).innerHTML = '<h3>Đã xảy ra lỗi khi tải trang.</h3>';
        }
    },

    executeScripts(container) {
        const scripts = container.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    }
};