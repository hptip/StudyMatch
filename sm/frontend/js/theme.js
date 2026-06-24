// theme.js
document.addEventListener('DOMContentLoaded', () => {
    // Check local storage for theme preference
    const savedTheme = localStorage.getItem('theme');
    
    // Apply theme on load
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    // Attach event listener to all theme toggle buttons
    const themeToggles = document.querySelectorAll('.theme-toggle-btn');
    
    // Update button icons based on current theme
    const updateIcons = () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        themeToggles.forEach(btn => {
            btn.innerHTML = isDark ? '☀️' : '🌙';
        });
    };
    
    updateIcons();

    themeToggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            }
            updateIcons();
        });
    });
});

// Immediately apply theme before DOMContentLoaded to prevent flashing
(function() {
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();
