document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const authMessage = document.getElementById('authMessage');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginForm.username.value;
            const password = loginForm.password.value;
            submitAuth('/api/auth/login', { username, password });
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = signupForm.username.value;
            const password = signupForm.password.value;
            submitAuth('/api/auth/signup', { username, password }, true);
        });
    }

    async function submitAuth(url, data, isSignup = false) {
        authMessage.textContent = "Processing...";
        authMessage.style.color = "var(--text-color)";

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                if (isSignup) {
                    authMessage.textContent = "Signup successful! Redirecting...";
                    authMessage.style.color = "#4ade80";
                    setTimeout(() => window.location.href = 'login.html', 1500);
                } else {
                    const result = await res.json();
                    localStorage.setItem('token', result.accessToken); // Save JWT
                    authMessage.textContent = "Login successful!";
                    authMessage.style.color = "#4ade80";
                    window.location.href = 'index.html'; // Go to home
                }
            } else {
                const msg = await res.text();
                authMessage.textContent = msg;
                authMessage.style.color = "red";
            }
        } catch (err) {
            console.error(err);
            authMessage.textContent = "Connection error";
            authMessage.style.color = "red";
        }
    }
});
