// === 1. CẤU HÌNH FIREBASE & API ===
        const firebaseConfig = {
            apiKey: "AIzaSyDp5lmz6nn_2Mh3UYj2UAecP0qte-MvfFo",
            authDomain: "to1-pro.firebaseapp.com",
            projectId: "to1-pro",
            storageBucket: "to1-pro.firebasestorage.app",
            messagingSenderId: "798435742079",
            appId: "1:798435742079:web:d432a0e46bb564f31e8a4a",
            databaseURL: "https://to1-pro-default-rtdb.asia-southeast1.firebasedatabase.app"
        };
        
        firebase.initializeApp(firebaseConfig);
        const db = firebase.database();
        
        const IMGBB_API_KEY = "56453e8c834f6fa8df422bda2e5a0669"; 
        const clickSound = new Audio('https://actions.google.com/sounds/v1/cartoon/pop.ogg');
        const discordSound = new Audio('https://www.myinstants.com/media/sounds/discord-notification.mp3');
        const bubblePopSound = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3'); 
        const hoverWaterSound = new Audio('https://actions.google.com/sounds/v1/water/water_drop.ogg');
        hoverWaterSound.volume = 0.3; 

        let previousNotifCount = 0; 
        let currentUser = { name: "", email: "", emailKey: "", role: "member" };

        // Firebase listener refs for cleanup
        let userProfileRef = null;
        let postsRef = null;
        let chatRef = null;
        let deadlinesRef = null;
        let notificationsRef = null;

        // === PERFORMANCE UTILITIES ===
        const PerfUtils = {
            debounce: (fn, delay) => {
                let timeoutId;
                return (...args) => {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => fn.apply(this, args), delay);
                };
            },
            throttle: (fn, limit) => {
                let inThrottle;
                return (...args) => {
                    if (!inThrottle) {
                        fn.apply(this, args);
                        inThrottle = true;
                        setTimeout(() => inThrottle = false, limit);
                    }
                };
            },
            lazyLoadImages: () => {
                if ('IntersectionObserver' in window) {
                    const observer = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                const img = entry.target;
                                if (img.dataset.src) {
                                    img.src = img.dataset.src;
                                    img.removeAttribute('data-src');
                                }
                                observer.unobserve(img);
                            }
                        });
                    }, { rootMargin: '50px' });
                    document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
                }
            },
            createFragment: () => document.createDocumentFragment(),
            batchAppend: (parent, html) => {
                parent.innerHTML = html;
            }
        };

        // Cache DOM elements
        const DOMCache = {
            postsArea: null,
            getPostsArea: () => {
                if (!DOMCache.postsArea) DOMCache.postsArea = document.getElementById('posts-area');
                return DOMCache.postsArea;
            }
        };

        // Firebase listener throttling
        let postsThrottle = null;
        let chatThrottle = null;
        let deadlinesThrottle = null;

        const createThrottledListener = (callback, delay = 300) => {
            let lastCall = 0;
            return (...args) => {
                const now = Date.now();
                if (now - lastCall >= delay) {
                    lastCall = now;
                    callback.apply(this, args);
                }
            };
        };

        // === BẢO MẬT: HÀM MÃ HÓA KÝ TỰ NGĂN CHẶN XSS HACK ===
        function formatText(str) {
            if (!str) return '';
            return String(str).replace(/[&<>'"]/g, tag => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
            }[tag])).replace(/\n/g, '<br>');
        }

        // === DANH SÁCH 10 THÀNH TỰU ===
        const ACHIEVEMENTS = [
            { name: "Tân Binh", icon: "🎯", class: "badge-green", desc: "Đạt Level 2", condition: (u, stats) => (u.level || 1) >= 2 },
            { name: "Chiến Binh", icon: "⚔️", class: "badge-blue", desc: "Đạt Level 10", condition: (u, stats) => (u.level || 1) >= 10 },
            { name: "Bậc Thầy", icon: "🎖️", class: "badge-purple", desc: "Đạt Level 25", condition: (u, stats) => (u.level || 1) >= 25 },
            { name: "Huyền Thoại", icon: "🌟", class: "badge-gold", desc: "Đạt Level 50", condition: (u, stats) => (u.level || 1) >= 50 },
            { name: "Vô Địch", icon: "👑", class: "badge-rainbow", desc: "Đạt Level 100", condition: (u, stats) => (u.level || 1) >= 100 },
            { name: "Ngòi Bút", icon: "✒️", class: "badge-cyan", desc: "Đăng 10 bài viết", condition: (u, stats) => (stats.postCount || 0) >= 10 },
            { name: "Cao Thủ", icon: "📝", class: "badge-orange", desc: "Đăng 50 bài viết", condition: (u, stats) => (stats.postCount || 0) >= 50 },
            { name: "Bình Luận", icon: "💭", class: "badge-blue", desc: "Viết 20 bình luận", condition: (u, stats) => (stats.commentCount || 0) >= 20 },
            { name: "Nghệ Nhân", icon: "🎨", class: "badge-purple", desc: "Viết 100 bình luận", condition: (u, stats) => (stats.commentCount || 0) >= 100 },
            { name: "Kiên Trì", icon: "🔥", class: "badge-red", desc: "Chuỗi 7 ngày", condition: (u, stats) => (u.streak || 0) >= 7 },
            { name: "Bền Bỉ", icon: "💪", class: "badge-orange", desc: "Chuỗi 30 ngày", condition: (u, stats) => (u.streak || 0) >= 30 },
            { name: "Huy Hoàng", icon: "✨", class: "badge-rainbow", desc: "Chuỗi 100 ngày", condition: (u, stats) => (u.streak || 0) >= 100 }
        ];

        function getLevelTier(level) {
            if (!level || level < 25) return 1;
            if (level < 50) return 2;
            if (level < 75) return 3;
            if (level < 100) return 4;
            return 5;
        }

        function getXPForLevel(level) {
            if (level < 25) return 100;
            if (level < 50) return 200;
            if (level < 75) return 350;
            if (level < 100) return 500;
            return 750;
        }

        function getXPProgress(userXP, userLevel) {
            const currentLevelXP = getXPForLevel(userLevel);
            return { current: userXP, required: currentLevelXP };
        }

        function getUserEffects(user) {
            const equippedEffect = user.equippedEffect || 'none';
            const equippedShopEffect = user.equippedShopEffect || 'none';
            let nameEff = '';
            let avatarEff = '';
            let postEff = '';
            let frameEff = '';
            
            if (equippedShopEffect !== 'none' && equippedShopEffect.startsWith('shop_')) {
                if (equippedShopEffect === 'shop_name_rainbow') nameEff = 'effect-name-rainbow';
                if (equippedShopEffect === 'shop_avatar_golden') avatarEff = 'effect-avatar-golden';
                if (equippedShopEffect === 'shop_name_fire') nameEff = 'effect-name-fire';
                if (equippedShopEffect === 'shop_avatar_ice') avatarEff = 'effect-avatar-ice';
                if (equippedShopEffect === 'shop_name_glitch') nameEff = 'effect-name-glitch';
                if (equippedShopEffect === 'shop_avatar_neon') avatarEff = 'effect-avatar-neon';
                if (equippedShopEffect === 'shop_name_cyber') nameEff = 'effect-name-cyber';
                if (equippedShopEffect === 'shop_avatar_wings') avatarEff = 'effect-avatar-wings';
                if (equippedShopEffect === 'shop_avatar_demon') avatarEff = 'effect-avatar-demon';
                if (equippedShopEffect === 'shop_avatar_galaxy') avatarEff = 'effect-avatar-galaxy';
            } else {
                if (equippedEffect === 'effect-name-wave') nameEff = 'effect-name-wave';
                if (equippedEffect === 'effect-name-ocean') nameEff = 'effect-name-ocean';
                if (equippedEffect === 'effect-avatar-glow') avatarEff = 'effect-avatar-glow';
                if (equippedEffect === 'effect-avatar-hologram') avatarEff = 'effect-avatar-hologram';
                if (equippedEffect === 'effect-avatar-cosmic') avatarEff = 'effect-avatar-cosmic';
                if (equippedEffect === 'effect-name-electric') nameEff = 'effect-name-electric';
                if (equippedEffect === 'effect-name-mystic') nameEff = 'effect-name-mystic';
                if (equippedEffect === 'effect-name-star') nameEff = 'effect-name-star';
                if (equippedEffect === 'effect-name-god') nameEff = 'effect-name-god';
                if (equippedEffect === 'effect-post-neon') postEff = 'effect-post-neon';
            }
            
            // Xử lý frame effects (khung viền)
            if (equippedShopEffect && equippedShopEffect.startsWith('frame_')) {
                frameEff = 'effect-' + equippedShopEffect.replace('_', '-');
            }
            
            return { nameEff, avatarEff, postEff, frameEff };
        }

        function playSound() { clickSound.currentTime = 0; clickSound.play().catch(()=>{}); }
        function playHoverSound() { hoverWaterSound.currentTime = 0; hoverWaterSound.play().catch(()=>{}); }
        
        const getEmailKey = (email) => email.replace(/\./g, '_');

        function getAvatarUrl(name, customAvatarUrl) {
            return customAvatarUrl ? customAvatarUrl : `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
        }

        document.addEventListener('mouseover', function(e) {
            if(e.target.closest('.hover-target') || e.target.closest('.action-btn')) { playHoverSound(); }
        }, { passive: true });

        // Event delegation for dynamic content
        document.addEventListener('click', PerfUtils.throttle((e) => {
            // Handle dynamic elements
            if (e.target.closest('.view-more-comments')) {
                const el = e.target.closest('.view-more-comments');
                const postId = el.id.replace('toggle-comments-', '');
                const expanded = el.dataset.expanded === 'true';
                toggleComments(postId, 0);
                el.dataset.expanded = !expanded;
            }
        }, 200), { passive: true });

        // === 2. GIAO DIỆN & DARK MODE ===
        const authContainer = document.getElementById('auth-container');
        document.getElementById('register').addEventListener('click', () => authContainer.classList.add("active"));
        document.getElementById('login').addEventListener('click', () => authContainer.classList.remove("active"));

        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        }
        if(localStorage.getItem('darkMode') === 'true') document.body.classList.add('dark-mode');

        // === 3. XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ ===
        window.onload = () => {
            const savedEmail = localStorage.getItem('currentEmail');
            if (savedEmail) {
                db.ref('users/' + getEmailKey(savedEmail)).once('value', snapshot => {
                    if (snapshot.exists()) {
                        const u = snapshot.val();
                        loginSuccess(u.name, u.email, u.role || 'member');
                    }
                });
            }
        };

        function setOnlineStatus() {
            const userStatusRef = db.ref('/users/' + currentUser.emailKey + '/online');
            db.ref('.info/connected').on('value', function(snapshot) {
                if (snapshot.val() === false) return;
                userStatusRef.onDisconnect().set(false).then(() => { userStatusRef.set(true); });
            });
        }

        function loginSuccess(name, email, role) {
            currentUser = { name, email, emailKey: getEmailKey(email), role };
            document.getElementById('login-wrapper').style.display = 'none';
            document.getElementById('main-wrapper').style.display = 'block';
            
            setOnlineStatus(); 
            updateAllUserBadges(); 
            loadUserProfile();
            listenPosts(); 
            listenAllNotifications(); 
            listenDeadlines(); 
            listenChatMessages(); 
            fetchWeather(); // Nạp thời tiết
        }

        function logoutUser() {
            // Cleanup Firebase listeners before logout
            if (userProfileRef) userProfileRef.off();
            if (postsRef) postsRef.off();
            if (chatRef) chatRef.off();
            if (deadlinesRef) deadlinesRef.off();
            if (notificationsRef) notificationsRef.off();
            
            db.ref('/users/' + currentUser.emailKey + '/online').set(false).then(() => {
                localStorage.clear(); 
                window.location.reload();
            });
        }

        document.getElementById('signUpForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnSignUp');
            const name = document.getElementById('regName').value.trim();
            const email = document.getElementById('regEmail').value.trim().toLowerCase();
            const password = document.getElementById('regPass').value;
            const emailKey = getEmailKey(email);

            btn.disabled = true; btn.innerText = "Đang xử lý...";
            try {
                const userRef = db.ref('users/' + emailKey);
                const snapshot = await userRef.once('value');
                if (snapshot.exists()) { Swal.fire("Lỗi!", "Email này đã được đăng ký rồi!", "error"); } 
                else {
                    await userRef.set({ name, email, password, role: "member", bio: "Chưa có tiểu sử.", online: false, xp: 0, level: 1, ownedEffects: [], ownedTags: [], hiddenTags: [], equippedShopEffect: null });
                    Swal.fire("Thành công!", "Đăng ký thành công! Hãy đăng nhập.", "success");
                    authContainer.classList.remove("active");
                    document.getElementById('signUpForm').reset();
                }
            } catch (err) { Swal.fire("Lỗi!", "Không kết nối được máy chủ", "error"); } 
            finally { btn.disabled = false; btn.innerText = "Đăng Ký"; }
        });

        document.getElementById('signInForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnSignIn');
            const emailInput = document.getElementById('loginEmail').value.trim().toLowerCase();
            const passwordInput = document.getElementById('loginPass').value;
            const emailKey = getEmailKey(emailInput);

            btn.disabled = true; btn.innerText = "Đang kiểm tra...";
            try {
                const snapshot = await db.ref('users/' + emailKey).once('value');
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    if (userData.password === passwordInput) {
                        localStorage.setItem('currentEmail', userData.email);
                        Swal.fire("Thành công!", `Chào mừng ${formatText(userData.name)}!`, "success");
                        loginSuccess(userData.name, userData.email, userData.role || 'member');
                    } else { Swal.fire("Lỗi!", "Sai mật khẩu!", "error"); }
                } else { Swal.fire("Lỗi!", "Tài khoản không tồn tại!", "error"); }
            } catch (err) { Swal.fire("Lỗi!", "Kiểm tra kết nối mạng.", "error"); } 
            finally { btn.disabled = false; btn.innerText = "Đăng Nhập"; }
        });

        // === 4. TÍNH NĂNG NGHE NHẠC BẰNG POPUP GỐC ĐÃ SỬA LỖI YOUTUBE ===
        function playMusicInfo(e, url) {
            if(e) e.stopPropagation();
            if(!url) return;
            
            let embedUrl = url;
            const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
            
            if (ytMatch && ytMatch[1]) {
                const videoId = ytMatch[1];
                const currentOrigin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "https://to1-pro.firebaseapp.com";
                // Đã chèn thêm enablejsapi=1 và mã hóa origin để fix triệt để lỗi Iframe Youtube
                embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(currentOrigin)}&rel=0`;
                
                Swal.fire({
                    title: '🎵 Đang phát nhạc',
                    html: `
                        <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 15px;">
                            <iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
                        </div>
                    `,
                    showConfirmButton: false, showCloseButton: true, width: 500
                });
            } else if (url.match(/\.(mp3|wav|m4a|ogg)$/i) || url.includes('./')) {
                Swal.fire({
                    title: '🎵 Đang phát nhạc',
                    html: `<audio controls autoplay style="width:100%; outline:none; margin-top: 15px;"><source src="${url}" type="audio/mpeg">Trình duyệt của bạn không hỗ trợ phát nhạc.</audio>`,
                    showConfirmButton: false, showCloseButton: true
                });
            } else {
                window.open(url, '_blank');
            }
        }

        async function setMusicStatus() {
            const snap = await db.ref('users/' + currentUser.emailKey).once('value');
            const u = snap.val();
            const currentMusic = u.music || '';
            const currentMusicUrl = u.musicUrl || '';

            const { value: formValues } = await Swal.fire({
                title: '🎵 Bạn đang nghe gì?',
                html: `
                    <input id="swal-music-name" class="swal2-input" placeholder="Tên bài hát (VD: Nắng Ấm Xa Dần)" value="${formatText(currentMusic)}">
                    <input id="swal-music-url" class="swal2-input" placeholder="Link YouTube/MP3 (Tuỳ chọn)" value="${formatText(currentMusicUrl)}">
                    <small style="display:block; margin-top:10px; color:#888;">Để trống ô nhập tên nếu bạn muốn tắt nhạc</small>
                `,
                showCancelButton: true, confirmButtonColor: '#764ba2',
                preConfirm: () => {
                    return {
                        music: document.getElementById('swal-music-name').value.trim(),
                        musicUrl: document.getElementById('swal-music-url').value.trim()
                    }
                }
            });

            if (formValues && formValues.music !== undefined) {
                if(formValues.music === "") {
                    await db.ref('users/' + currentUser.emailKey).update({ music: null, musicUrl: null });
                    Swal.fire('Đã tắt nhạc!', '', 'success');
                } else {
                    await db.ref('users/' + currentUser.emailKey).update({ 
                        music: formValues.music,
                        musicUrl: formValues.musicUrl 
                    });
                    Swal.fire('Đã cập nhật nhạc!', '', 'success');
                }
            }
        }

        // === WIDGET THỜI TIẾT VÀ LỊCH HỌC TẬP ===
        async function fetchWeather() {
            try {
                // Tọa độ Mỹ Tho Tiền Giang
                const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=10.35&longitude=106.35&current_weather=true');
                const data = await res.json();
                const cw = data.current_weather;
                const code = cw.weathercode;
                
                let icon = 'fa-sun'; let desc = 'Trời nắng đẹp';
                if(code === 1 || code === 2 || code === 3) { icon = 'fa-cloud-sun'; desc = 'Trời nhiều mây'; }
                else if(code >= 45 && code <= 67) { icon = 'fa-cloud-rain'; desc = 'Có mưa rào / Mưa phùn'; }
                else if(code >= 80 && code <= 99) { icon = 'fa-cloud-bolt'; desc = 'Mưa dông có sấm sét'; }

                document.getElementById('weather-content').innerHTML = `
                    <div class="weather-info">
                        <div style="text-align: left;">
                            <div class="weather-temp">${cw.temperature}°C</div>
                            <div class="weather-desc"><b>${desc}</b><br><i class="fa-solid fa-wind"></i> Gió: ${cw.windspeed} km/h</div>
                        </div>
                        <i class="fa-solid ${icon} weather-icon"></i>
                    </div>
                `;
            } catch(e) {
                document.getElementById('weather-content').innerHTML = '<span style="color:#ff6b6b; font-size:0.85rem;">Không thể tải dữ liệu thời tiết lúc này.</span>';
            }
        }

        function renderMiniCalendar(events = []) {
            const calEl = document.getElementById('mini-calendar');
            if(!calEl) return;
            
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth();
            const currentDate = today.getDate();
            
            let firstDay = new Date(year, month, 1).getDay(); // Chủ nhật = 0
            if (firstDay === 0) firstDay = 7; 
            
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            
            const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
            let html = dayNames.map(d => `<div class="cal-day-header">${d}</div>`).join('');
            
            for(let i = 1; i < firstDay; i++) { html += `<div></div>`; }
            
            const eventDateStrs = events.map(e => e.date);

            for(let i = 1; i <= daysInMonth; i++) {
                let isToday = i === currentDate ? 'today' : '';
                let dStr = `${i.toString().padStart(2, '0')}/${(month+1).toString().padStart(2, '0')}/${year}`;
                let hasEvent = eventDateStrs.includes(dStr) ? 'has-event' : '';
                
                html += `<div class="cal-day ${isToday} ${hasEvent}">${i}</div>`;
            }
            calEl.innerHTML = html;
        }

        // === MINI GAMES ===
        function openMiniGame() {
            Swal.fire({
                title: '🎮 Trung Tâm Giải Trí',
                html: `
                    <button class="game-menu-btn" onclick="startClickGame()">🖱️ Đua Click Nhanh (Nhận XP)</button>
                    <button class="game-menu-btn" onclick="startCaroGame()">⭕ Kẻ Ca-rô (Caro vs Bot)</button>
                    <button class="game-menu-btn" onclick="Swal.close(); openPlantGame()">🌱 Trồng Cây Ảo</button>
                `,
                showConfirmButton: false,
                showCloseButton: true
            });
        }

        window.lastClickTime = 0;
        let clickCount = 0;
        let gameTimer = 10;
        let gameInterval;
        
        function startClickGame() {
            clickCount = 0; gameTimer = 10;
            Swal.fire({
                title: 'Đua Click Nhanh!',
                html: `
                    <h2 id="game-timer" style="color:#ff6b6b; font-size:3rem; margin: 0;">10</h2>
                    <p style="color:var(--text-sub); margin-bottom: 20px;">Nhấp vào nút bên dưới càng nhanh càng tốt để nhận XP!</p>
                    <button id="btn-click-target" style="width:150px; height:150px; border-radius:50%; background:linear-gradient(135deg, #4ecdc4, #55efc4); color:white; font-size:1.5rem; font-weight:900; border:none; cursor:pointer; box-shadow:0 10px 20px rgba(78,205,196,0.4); transition:0.1s; user-select: none;" onmousedown="registerClick()">BẤM ĐI!</button>
                    <h3 id="click-score" style="margin-top: 20px; color: var(--text-main);">Điểm: 0</h3>
                `,
                showConfirmButton: false,
                allowOutsideClick: false,
                didOpen: () => {
                    gameInterval = setInterval(() => {
                        gameTimer--;
                        const timerEl = document.getElementById('game-timer');
                        if(timerEl) timerEl.innerText = gameTimer;
                        if(gameTimer <= 0) {
                            clearInterval(gameInterval);
                            endClickGame();
                        }
                    }, 1000);
                }
            });
        }

        function registerClick() {
            if(gameTimer > 0) {
                const now = Date.now();
                // Giới hạn max ~30 click/s để chống Tool Hack Auto-clicker
                if (now - window.lastClickTime < 30) return; 
                window.lastClickTime = now;
                
                clickCount++;
                document.getElementById('click-score').innerText = 'Điểm: ' + clickCount;
                let btn = document.getElementById('btn-click-target');
                btn.style.transform = 'scale(0.9)';
                setTimeout(()=> btn.style.transform = 'scale(1)', 50);
                bubblePopSound.currentTime = 0; bubblePopSound.play().catch(()=>{});
            }
        }

        function endClickGame() {
            let xpEarned = Math.floor(clickCount / 5);
            if(xpEarned > 0) gainXP(xpEarned);
            Swal.fire({
                title: 'Hết giờ!',
                text: `Bạn đã nhấp ${clickCount} lần và nhận được ${xpEarned} XP!`,
                icon: 'success',
                confirmButtonText: 'Chơi lại',
                showCancelButton: true,
                cancelButtonText: 'Thoát Menu',
                confirmButtonColor: '#4ecdc4'
            }).then((res) => {
                if(res.isConfirmed) startClickGame();
                else openMiniGame();
            });
        }

        function startCaroGame() {
            let board = ['', '', '', '', '', '', '', '', ''];
            let human = 'X', bot = 'O';
            
            const renderBoard = () => {
                let html = '<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; max-width:260px; margin:0 auto;">';
                board.forEach((cell, idx) => {
                    let color = cell === 'X' ? '#4ecdc4' : '#ff6b6b';
                    html += `<div onclick="window.makeCaroMove(${idx})" class="hover-target" style="height:80px; background:var(--bg-body); border:2px solid var(--border-color); border-radius:15px; display:flex; align-items:center; justify-content:center; font-size:3rem; font-weight:900; color:${color}; cursor:pointer; box-shadow:0 4px 6px rgba(0,0,0,0.05);">${cell}</div>`;
                });
                html += '</div>';
                return html;
            };

            window.makeCaroMove = (idx) => {
                if(board[idx] !== '') return;
                board[idx] = human;
                clickSound.currentTime = 0; clickSound.play().catch(()=>{});
                if(checkWinnerCaro()) return;
                if(document.getElementById('caro-board')) {
                    document.getElementById('caro-board').innerHTML = renderBoard();
                    document.getElementById('caro-board').style.pointerEvents = 'none'; 
                    setTimeout(botMove, 600);
                }
            };

            const botMove = () => {
                let empty = board.map((c, i) => c === '' ? i : null).filter(i => i !== null);
                if(empty.length === 0) return;
                let move = empty[Math.floor(Math.random() * empty.length)];
                board[move] = bot;
                if(document.getElementById('caro-board')) {
                    document.getElementById('caro-board').innerHTML = renderBoard();
                    document.getElementById('caro-board').style.pointerEvents = 'auto'; 
                }
                checkWinnerCaro();
            };

            const checkWinnerCaro = () => {
                const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                for(let w of wins) {
                    if(board[w[0]] && board[w[0]] === board[w[1]] && board[w[0]] === board[w[2]]) {
                        if(board[w[0]] === human) {
                            gainXP(20);
                            Swal.fire('Thắng rồi!', 'Tuyệt vời, bạn được cộng 20 XP', 'success').then(openMiniGame);
                        } else {
                            Swal.fire('Thua mất rồi!', 'Bot đã thắng, chúc bạn may mắn lần sau!', 'error').then(openMiniGame);
                        }
                        return true;
                    }
                }
                if(!board.includes('')) {
                    gainXP(5);
                    Swal.fire('Hòa!', 'Trận đấu căng thẳng. Bạn nhận được 5 XP khích lệ', 'info').then(openMiniGame);
                    return true;
                }
                return false;
            };

            Swal.fire({
                title: 'Caro vs Bot',
                html: '<p style="color:var(--text-sub); margin-bottom: 15px;">Bạn đánh chữ X. Chiến thắng để lấy 20 XP!</p><div id="caro-board">' + renderBoard() + '</div>',
                showConfirmButton: false,
                showCloseButton: true
            });
        }

        // === VIRTUAL PLANT GAME - REALISTIC ===
        const PLANT_STAGES = [
            { name: "Mầm đất", minLevel: 0, icon: "🌱", img: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=200&h=200&fit=crop" },
            { name: "Cây non", minLevel: 1, icon: "🌿", img: "https://images.unsplash.com/photo-1457530378978-8bac673b8062?w=200&h=250&fit=crop" },
            { name: "Cây trưởng thành", minLevel: 2, icon: "🌳", img: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=200&h=280&fit=crop" },
            { name: "Cây ra hoa", minLevel: 3, icon: "🌸", img: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=200&h=280&fit=crop" }
        ];

        function getPlantData() {
            const saved = localStorage.getItem('virtualPlant');
            if (saved) {
                return JSON.parse(saved);
            }
            return { level: 0, xp: 0, maxXP: 100 };
        }

        function savePlantData(data) {
            localStorage.setItem('virtualPlant', JSON.stringify(data));
        }

        function getWaterToday() {
            const today = new Date().toDateString();
            const saved = localStorage.getItem('waterDate');
            if (saved !== today) {
                localStorage.setItem('waterCount', '0');
                localStorage.setItem('waterDate', today);
                return 0;
            }
            return parseInt(localStorage.getItem('waterCount') || '0');
        }

        function incrementWaterCount() {
            const today = new Date().toDateString();
            let count = parseInt(localStorage.getItem('waterCount') || '0');
            count++;
            localStorage.setItem('waterCount', count.toString());
            localStorage.setItem('waterDate', today);
        }

        // Organic Morphing Tree SVG
        const ORGANIC_TREE_SVG = `
            <svg class="organic-svg" viewBox="0 0 300 350" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <!-- Trunk gradient -->
                    <linearGradient id="trunkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#5D4037"/>
                        <stop offset="40%" style="stop-color:#795548"/>
                        <stop offset="100%" style="stop-color:#4E342E"/>
                    </linearGradient>
                    
                    <!-- Leaves gradient -->
                    <linearGradient id="leavesGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" style="stop-color:#2E7D32"/>
                        <stop offset="40%" style="stop-color:#4CAF50"/>
                        <stop offset="100%" style="stop-color:#81C784"/>
                    </linearGradient>
                    
                    <!-- Flower gradient -->
                    <radialGradient id="flowerGradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" style="stop-color:#FFEB3B"/>
                        <stop offset="50%" style="stop-color:#FF9800"/>
                        <stop offset="100%" style="stop-color:#E91E63"/>
                    </radialGradient>
                    
                    <!-- Glow filter -->
                    <filter id="treeGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="glow"/>
                        <feMerge>
                            <feMergeNode in="glow"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
                
                <!-- Stage 1: Seed/Sprout -->
                <g id="stage-seed" class="organic-layer tree-seed">
                    <ellipse cx="150" cy="300" rx="20" ry="30" fill="url(#trunkGradient)"/>
                    <ellipse cx="150" cy="270" rx="12" ry="20" fill="url(#leavesGradient)"/>
                </g>
                
                <!-- Stage 2: Sapling -->
                <g id="stage-sapling" class="organic-layer tree-sapling">
                    <path d="M150,320 Q145,280 150,220 Q155,280 150,320" fill="url(#trunkGradient)"/>
                    <ellipse cx="150" cy="210" rx="25" ry="35" fill="url(#leavesGradient)"/>
                    <ellipse cx="130" cy="230" rx="15" ry="22" fill="url(#leavesGradient)" transform="rotate(-20,130,230)"/>
                    <ellipse cx="170" cy="235" rx="15" ry="22" fill="url(#leavesGradient)" transform="rotate(20,170,235)"/>
                </g>
                
                <!-- Stage 3: Full Tree -->
                <g id="stage-tree" class="organic-layer tree-full">
                    <!-- Trunk -->
                    <path d="M135,340 Q130,280 135,220 Q140,180 150,140 Q160,180 165,220 Q170,280 165,340 Z" fill="url(#trunkGradient)"/>
                    
                    <!-- Main canopy -->
                    <ellipse cx="150" cy="120" rx="70" ry="60" fill="url(#leavesGradient)" filter="url(#treeGlow)"/>
                    <ellipse cx="110" cy="150" rx="45" ry="40" fill="url(#leavesGradient)"/>
                    <ellipse cx="190" cy="145" rx="50" ry="45" fill="url(#leavesGradient)"/>
                    <ellipse cx="150" cy="80" rx="55" ry="45" fill="url(#leavesGradient)"/>
                    <ellipse cx="85" cy="170" rx="30" ry="25" fill="#66BB6A"/>
                    <ellipse cx="215" cy="165" rx="35" ry="28" fill="#66BB6A"/>
                    
                    <!-- Flowers for mature tree -->
                    <circle cx="100" cy="130" r="8" fill="url(#flowerGradient)" opacity="0.9"/>
                    <circle cx="180" cy="110" r="6" fill="url(#flowerGradient)" opacity="0.9"/>
                    <circle cx="150" cy="70" r="7" fill="url(#flowerGradient)" opacity="0.9"/>
                    <circle cx="200" cy="150" r="5" fill="url(#flowerGradient)" opacity="0.9"/>
                    <circle cx="120" cy="170" r="6" fill="url(#flowerGradient)" opacity="0.9"/>
                </g>
                
                <!-- Hidden reference shapes -->
                <path id="ref-seed" d="M150,300 Q130,280 150,240 Q170,280 150,300" visibility="hidden"/>
                <path id="ref-sapling" d="M150,320 Q145,280 150,220 Q155,280 150,320" visibility="hidden"/>
                <path id="ref-tree" d="M135,340 Q130,280 135,220 Q140,180 150,140 Q160,180 165,220 Q170,280 165,340 Z" visibility="hidden"/>
            </svg>
        `;

        // Watering Can SVG - Drawn with organic style like the tree
        const WATERING_CAN_SVG = `
            <svg class="watering-can-svg" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <!-- Can body gradient -->
                    <linearGradient id="canGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#78909C"/>
                        <stop offset="50%" style="stop-color:#546E7A"/>
                        <stop offset="100%" style="stop-color:#37474F"/>
                    </linearGradient>
                    
                    <!-- Metal shine -->
                    <linearGradient id="canShine" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#B0BEC5"/>
                        <stop offset="50%" style="stop-color:#78909C"/>
                        <stop offset="100%" style="stop-color:#546E7A"/>
                    </linearGradient>
                    
                    <!-- Water gradient -->
                    <linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#4FC3F7"/>
                        <stop offset="50%" style="stop-color:#29B6F6"/>
                        <stop offset="100%" style="stop-color:#0288D1"/>
                    </linearGradient>
                    
                    <!-- Spout gradient -->
                    <linearGradient id="spoutGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#546E7A"/>
                        <stop offset="50%" style="stop-color:#78909C"/>
                        <stop offset="100%" style="stop-color:#546E7A"/>
                    </linearGradient>
                    
                    <!-- Glow filter -->
                    <filter id="waterGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="glow"/>
                        <feMerge>
                            <feMergeNode in="glow"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
                
                <!-- Water spray (hidden by default, shown when pouring) -->
                <g id="water-spray" style="display: none;">
                    <ellipse cx="10" cy="85" rx="8" ry="4" fill="#4FC3F7" opacity="0.8">
                        <animate attributeName="opacity" values="0.8;0.4;0.8" dur="0.3s" repeatCount="indefinite"/>
                    </ellipse>
                    <ellipse cx="25" cy="88" rx="6" ry="3" fill="#29B6F6" opacity="0.7">
                        <animate attributeName="opacity" values="0.7;0.3;0.7" dur="0.25s" repeatCount="indefinite"/>
                    </ellipse>
                    <ellipse cx="18" cy="82" rx="5" ry="2" fill="#81D4FA" opacity="0.9">
                        <animate attributeName="opacity" values="0.9;0.5;0.9" dur="0.2s" repeatCount="indefinite"/>
                    </ellipse>
                </g>
                
                <!-- Can handle (back) -->
                <path d="M95,25 Q115,20 110,50 Q105,70 90,65" 
                      fill="none" stroke="url(#canGradient)" stroke-width="8" stroke-linecap="round"/>
                
                <!-- Can body -->
                <path d="M30,20 Q25,20 25,30 L25,70 Q25,85 40,85 L85,85 Q100,85 100,70 L100,30 Q100,20 95,20 Z" 
                      fill="url(#canShine)" stroke="#37474F" stroke-width="2"/>
                
                <!-- Can body highlight -->
                <path d="M30,25 Q28,25 28,35 L28,70 Q28,80 40,80 L85,80 Q92,80 92,70 L92,35 Q92,25 90,25 Z" 
                      fill="url(#canGradient)" opacity="0.6"/>
                
                <!-- Water inside (shown when pouring) -->
                <g id="water-inside" style="display: none;">
                    <path d="M30,50 L30,70 Q30,80 40,80 L85,80 Q92,80 92,70 L92,50 Q60,55 30,50 Z" 
                          fill="url(#waterGradient)" opacity="0.7"/>
                </g>
                
                <!-- Spout -->
                <path d="M25,45 Q5,50 5,70 Q5,85 15,85 L20,85 Q25,85 25,75 Q25,55 30,50" 
                      fill="url(#spoutGradient)" stroke="#37474F" stroke-width="1.5"/>
                
                <!-- Spout opening -->
                <ellipse cx="12" cy="82" rx="6" ry="4" fill="#37474F"/>
                <ellipse cx="12" cy="82" rx="4" ry="2.5" fill="#4FC3F7"/>
                
                <!-- Handle (front) -->
                <path d="M95,25 Q110,22 108,45 Q106,60 90,58" 
                      fill="none" stroke="url(#canShine)" stroke-width="6" stroke-linecap="round"/>
                
                <!-- Rose (sprinkler head) -->
                <g id="can-rose">
                    <ellipse cx="12" cy="80" rx="8" ry="3" fill="#78909C" stroke="#37474F" stroke-width="1"/>
                    <line x1="6" y1="80" x2="18" y2="80" stroke="#546E7A" stroke-width="1"/>
                    <line x1="8" y1="78" x2="16" y2="78" stroke="#546E7A" stroke-width="0.5"/>
                    <line x1="8" y1="82" x2="16" y2="82" stroke="#546E7A" stroke-width="0.5"/>
                </g>
                
                <!-- Decorative rivets -->
                <circle cx="35" cy="30" r="2" fill="#90A4AE"/>
                <circle cx="35" cy="50" r="2" fill="#90A4AE"/>
                <circle cx="35" cy="70" r="2" fill="#90A4AE"/>
                <circle cx="90" cy="30" r="2" fill="#90A4AE"/>
                <circle cx="90" cy="50" r="2" fill="#90A4AE"/>
                <circle cx="90" cy="70" r="2" fill="#90A4AE"/>
            </svg>
        `;

        let currentTreeStage = 0;
        let growthProgress = 0;

        function updateOrganicTree(xpPercent) {
            const seedEl = document.getElementById('stage-seed');
            const saplingEl = document.getElementById('stage-sapling');
            const treeEl = document.getElementById('stage-tree');
            
            if (!seedEl || !saplingEl || !treeEl) return;
            
            const targetStage = Math.floor(xpPercent / 33.33);
            const stageProgress = (xpPercent % 33.33) / 33.33;
            
            // Reset all
            seedEl.classList.remove('active', 'tree-seed');
            saplingEl.classList.remove('active', 'tree-sapling');
            treeEl.classList.remove('active', 'tree-full');
            
            if (targetStage === 0) {
                seedEl.classList.add('active', 'tree-seed');
                gsap.to(seedEl, {
                    scale: 0.5 + (stageProgress * 0.5),
                    duration: 1.5,
                    ease: "power2.out"
                });
            } else if (targetStage === 1) {
                seedEl.classList.add('active', 'tree-seed');
                saplingEl.classList.add('active', 'tree-sapling');
                
                gsap.to(seedEl, { scale: 0.3 + (0.4 * (1 - stageProgress)), opacity: 1 - stageProgress, duration: 1.5 });
                gsap.to(saplingEl, { scale: 0.5 + (stageProgress * 0.5), duration: 1.5, ease: "power2.out" });
            } else if (targetStage >= 2) {
                seedEl.classList.add('active', 'tree-seed');
                saplingEl.classList.add('active', 'tree-sapling');
                treeEl.classList.add('active', 'tree-full');
                
                const treeScale = 0.5 + (Math.min(stageProgress, 1) * 0.5);
                
                gsap.to(seedEl, { scale: 0.2, opacity: 0, duration: 1 });
                gsap.to(saplingEl, { scale: 0.3, opacity: 1 - stageProgress, duration: 1.2 });
                gsap.to(treeEl, { 
                    scale: treeScale, 
                    duration: 1.5, 
                    ease: "power2.out",
                    onComplete: () => {
                        treeEl.classList.add('organic-breathing');
                    }
                });
            }
            
            currentTreeStage = targetStage;
        }

        function triggerGrowthAnimation() {
            const treeEl = document.getElementById('stage-tree');
            if (!treeEl) return;
            
            // Remove breathing and add growth pulse
            treeEl.classList.remove('organic-breathing');
            treeEl.classList.add('growth-pulse');
            
            gsap.to(treeEl, {
                scale: 1.15,
                duration: 0.3,
                ease: "power2.out",
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    treeEl.classList.remove('growth-pulse');
                    treeEl.classList.add('organic-breathing');
                }
            });
            
            // Create sparkles
            const container = document.querySelector('.organic-tree-container');
            if (container) {
                for (let i = 0; i < 8; i++) {
                    setTimeout(() => {
                        const sparkle = document.createElement('div');
                        sparkle.className = 'tree-sparkle';
                        sparkle.style.left = (40 + Math.random() * 40) + '%';
                        sparkle.style.top = (20 + Math.random() * 40) + '%';
                        container.appendChild(sparkle);
                        setTimeout(() => sparkle.remove(), 1500);
                    }, i * 100);
                }
            }
        }

        function openPlantGame() {
            const plantData = getPlantData();
            const currentLevel = plantData.level + 1;
            const xpPercent = (plantData.xp / plantData.maxXP) * 100;
            const waterToday = getWaterToday();
            const isAdmin = currentUser.role === 'admin';
            const canWater = isAdmin || waterToday < 10;
            const remainingWater = isAdmin ? '∞' : (10 - waterToday);

            const stageNames = ['Mầm đất', 'Cây con', 'Cây trưởng thành', 'Cây cổ thụ'];
            const stageIcons = ['🌱', '🌿', '🌳', '🌸'];
            const currentStageName = stageNames[Math.min(plantData.level, 3)];
            const currentStageIcon = stageIcons[Math.min(plantData.level, 3)];

            Swal.fire({
                title: '🌱 Vườn Cây Của Bạn',
                html: `
                    <div class="plant-game-container" id="plant-game-area">
                        <div class="plant-game-title">🌱 Trồng Cây Ảo (Organic)</div>
                        <div class="plant-level-display">Cấp cây: <strong>${currentLevel}</strong></div>
                        <div class="plant-stage-display">Giai đoạn: <strong>${currentStageName}</strong> ${currentStageIcon}</div>
                        
                        <div class="organic-tree-container" id="tree-container">
                            <div class="watering-can" id="watering-can">${WATERING_CAN_SVG}</div>
                            <div class="water-stream" id="water-stream"></div>
                            ${ORGANIC_TREE_SVG}
                            <div class="splash" id="splash"></div>
                            <div class="soil" style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:120px;height:25px;background:linear-gradient(180deg,#5D4037,#3E2723);border-radius:50% 50% 45% 45%;"></div>
                        </div>
                        
                        <div class="plant-xp-bar-container">
                            <div class="plant-xp-bar-bg">
                                <div class="plant-xp-bar-fill" id="plant-xp-fill" style="width: ${xpPercent}%"></div>
                            </div>
                            <div class="xp-text" id="xp-text">${plantData.xp} / ${plantData.maxXP} XP</div>
                        </div>
                        
                        <div style="margin-bottom: 10px; font-size: 0.85rem; color: ${canWater ? '#2d5a27' : '#c62828'};">
                            💧 Lượt tưới hôm nay: <strong>${remainingWater}</strong>/10
                        </div>
                        
                        <button class="water-btn" id="water-btn" onclick="waterPlant()" ${!canWater ? 'disabled' : ''}>
                            💧 Tưới nước
                        </button>
                    </div>
                `,
                showConfirmButton: false,
                showCloseButton: true,
                width: '480px',
                customClass: { popup: 'plant-game-popup' }
            });
            
            setTimeout(() => {
                updateOrganicTree(xpPercent);
            }, 100);
        }

        function waterPlant() {
            const plantData = getPlantData();
            const waterToday = getWaterToday();
            const isAdmin = currentUser.role === 'admin';
            
            if (!isAdmin && waterToday >= 10) {
                Swal.fire({
                    title: '⚠️ Hết lượt!',
                    text: 'Bạn đã hết lượt tưới nước hôm nay. Quay lại vào ngày mai nhé!',
                    icon: 'warning',
                    confirmButtonColor: '#4CAF50'
                });
                return;
            }
            
            const waterBtn = document.getElementById('water-btn');
            if (waterBtn) waterBtn.disabled = true;
            
            const xpGain = Math.floor(plantData.maxXP * 0.1);
            
            const wateringCan = document.getElementById('watering-can');
            const waterStream = document.getElementById('water-stream');
            
            if (wateringCan) {
                wateringCan.classList.add('show');
                setTimeout(() => {
                    wateringCan.classList.add('pouring');
                }, 300);
            }
            
            setTimeout(() => {
                if (waterStream) {
                    waterStream.classList.add('flowing');
                }
                
                setTimeout(() => {
                    createSplash();
                }, 600);
            }, 500);
            
            setTimeout(() => {
                if (wateringCan) {
                    wateringCan.classList.remove('show', 'pouring');
                }
                if (waterStream) {
                    waterStream.classList.remove('flowing');
                }
                
                const plantWrapper = document.getElementById('plant-wrapper');
                if (plantWrapper) {
                    plantWrapper.classList.remove('shake');
                    void plantWrapper.offsetWidth;
                    plantWrapper.classList.add('shake');
                }
                
                setTimeout(() => {
                    plantData.xp += xpGain;
                    
                    if (!isAdmin) {
                        incrementWaterCount();
                    }
                    
                    const newWaterCount = getWaterToday();
                    const remaining = isAdmin ? '∞' : (10 - newWaterCount);
                    const waterInfo = document.querySelector('.plant-game-container div:nth-child(6)');
                    if (waterInfo) {
                        waterInfo.innerHTML = `💧 Lượt tưới hôm nay: <strong>${remaining}</strong>/10`;
                    }
                    
                    const newWaterBtn = document.getElementById('water-btn');
                    if (newWaterBtn && !isAdmin && newWaterCount >= 10) {
                        newWaterBtn.disabled = true;
                    } else if (newWaterBtn) {
                        newWaterBtn.disabled = false;
                    }
                    
                    if (plantData.xp >= plantData.maxXP) {
                        plantData.xp = plantData.xp - plantData.maxXP;
                        plantData.level++;
                        
                        if (plantData.level >= 4) {
                            plantData.maxXP = plantData.maxXP + 100;
                            plantData.xp = 0;
                            plantData.level = 3;
                        } else {
                            plantData.maxXP = Math.floor(plantData.maxXP * 1.5);
                        }
                        
                        savePlantData(plantData);
                        showLevelUpEffect(plantData.level);
                    } else {
                        savePlantData(plantData);
                        updatePlantUI(plantData);
                    }
                }, 500);
            }, 2000);
        }

        function createSplash() {
            const splash = document.getElementById('splash');
            if (!splash) return;
            
            // Create multiple splash particles
            for (let i = 0; i < 12; i++) {
                const particle = document.createElement('div');
                particle.className = 'splash-particle';
                const angle = (i / 12) * Math.PI * 2;
                const distance = 25 + Math.random() * 25;
                const tx = Math.cos(angle) * distance;
                const ty = -Math.abs(Math.sin(angle) * distance) - 15;
                particle.style.setProperty('--tx', tx + 'px');
                particle.style.setProperty('--ty', ty + 'px');
                particle.style.left = (35 + Math.random() * 30) + '%';
                particle.style.bottom = '0px';
                
                // Random size variation
                const size = 4 + Math.random() * 6;
                particle.style.width = size + 'px';
                particle.style.height = size + 'px';
                
                splash.appendChild(particle);
                
                setTimeout(() => particle.remove(), 600);
            }
            
            // Create ripple effect on soil
            setTimeout(() => {
                const treeContainer = document.getElementById('tree-container');
                if (!treeContainer) return;
                
                for (let r = 0; r < 3; r++) {
                    setTimeout(() => {
                        const ripple = document.createElement('div');
                        ripple.className = 'soil-ripple';
                        ripple.style.animationDelay = (r * 0.15) + 's';
                        treeContainer.appendChild(ripple);
                        
                        setTimeout(() => ripple.remove(), 800);
                    }, r * 100);
                }
            }, 400);
        }

        const stageNames = ['Mầm đất', 'Cây con', 'Cây trưởng thành', 'Cây cổ thụ'];
        const stageIcons = ['🌱', '🌿', '🌳', '🌸'];

        function showLevelUpEffect(newLevel) {
            const gameArea = document.getElementById('plant-game-area');
            if (!gameArea) return;
            
            triggerGrowthAnimation();
            
            for (let i = 0; i < 15; i++) {
                setTimeout(() => {
                    const sparkle = document.createElement('div');
                    sparkle.className = 'sparkle-realistic';
                    sparkle.style.left = (Math.random() * 70 + 15) + '%';
                    sparkle.style.top = (Math.random() * 50 + 20) + '%';
                    gameArea.appendChild(sparkle);
                    
                    setTimeout(() => sparkle.remove(), 1200);
                }, i * 60);
            }
            
            setTimeout(() => {
                const organicSvg = document.querySelector('.organic-svg');
                if (organicSvg) {
                    organicSvg.classList.add('growth-pulse');
                }
                
                setTimeout(() => {
                    if (organicSvg) {
                        organicSvg.classList.remove('growth-pulse');
                    }
                    
                    const currentStageName = stageNames[Math.min(newLevel, 3)];
                    const currentStageIcon = stageIcons[Math.min(newLevel, 3)];
                    
                    Swal.fire({
                        title: '🎉 Chúc mừng!',
                        html: `
                            <div style="text-align: center;">
                                <div style="font-size: 3.5rem; margin: 10px 0;">${currentStageIcon}</div>
                                <h3 style="color: #4CAF50;">Cây đã lớn hơn!</h3>
                                <p>Cấp cây: <strong>${newLevel + 1}</strong></p>
                                <p>Giai đoạn: <strong>${currentStageName}</strong></p>
                            </div>
                        `,
                        icon: 'success',
                        timer: 2500,
                        showConfirmButton: false
                    });
                    
                    updatePlantUI(getPlantData());
                }, 1500);
            }, 600);
        }

        function updatePlantUI(plantData) {
            const xpFill = document.getElementById('plant-xp-fill');
            const xpText = document.getElementById('xp-text');
            const levelDisplay = document.querySelector('.plant-level-display');
            const stageDisplay = document.querySelector('.plant-stage-display');
            
            const xpPercent = (plantData.xp / plantData.maxXP) * 100;
            updateOrganicTree(xpPercent);
            
            if (xpFill) {
                xpFill.style.width = xpPercent + '%';
            }
            
            if (xpText) {
                xpText.textContent = `${plantData.xp} / ${plantData.maxXP} XP`;
            }
            
            if (levelDisplay) {
                levelDisplay.innerHTML = `Cấp cây: <strong>${plantData.level + 1}</strong>`;
            }
            
            if (stageDisplay) {
                const currentStageName = stageNames[Math.min(plantData.level, 3)];
                const currentStageIcon = stageIcons[Math.min(plantData.level, 3)];
                stageDisplay.innerHTML = `Giai đoạn: <strong>${currentStageName}</strong> ${currentStageIcon}`;
            }
        }

        // === BẢNG XẾP HẠNG (PODIUM LEADERBOARD) ===
        async function showLeaderboard() {
            const snap = await db.ref('users').once('value');
            const users = snap.val();
            if (!users) return Swal.fire("Thông báo", "Chưa có dữ liệu thành viên.", "info");

            let userArray = Object.keys(users).map(k => ({ key: k, ...users[k] }));
            userArray.sort((a, b) => (b.xp || 0) - (a.xp || 0));

            let html = '<div style="max-height: 550px; overflow-y: auto; overflow-x: hidden; text-align: left; padding: 5px;">';
            
            if (userArray.length >= 3) {
                const top1 = userArray[0];
                const top2 = userArray[1];
                const top3 = userArray[2];

                const buildPodiumItem = (u, rank) => {
                    if(!u) return `<div class="podium-item"></div>`;
                    let tier = getLevelTier(u.level);
                    const effects = getUserEffects(u);
                    
                    return `
                    <div class="podium-item podium-rank-${rank}" onclick="Swal.close(); viewProfile('${u.key}')">
                        <div class="podium-name name-level-${tier} ${effects.nameEff}" title="${formatText(u.name)}">${formatText(u.name)}</div>
                        <img src="${getAvatarUrl(u.name, u.customAvatar)}" class="podium-avatar ${effects.avatarEff} ${effects.frameEff}">
                        <div class="podium-step">
                            <span class="podium-rank-num">${rank}</span>
                            <span class="podium-xp">${u.xp || 0} XP</span>
                        </div>
                    </div>`;
                };

                html += `<div class="podium-wrapper">
                    ${buildPodiumItem(top2, 2)}
                    ${buildPodiumItem(top1, 1)}
                    ${buildPodiumItem(top3, 3)}
                </div>`;
            }

            html += '<div class="leaderboard-list">';
            const startIndex = userArray.length >= 3 ? 3 : 0;
            
            for(let i = startIndex; i < userArray.length; i++) {
                const u = userArray[i];
                let rankDisplay = i + 1;
                let tier = getLevelTier(u.level);
                const effects = getUserEffects(u);

                html += `
                    <div class="leaderboard-item hover-target" onclick="Swal.close(); viewProfile('${u.key}')">
                        <div style="display:flex; align-items:center; gap: 15px;">
                            <div class="leaderboard-rank">${rankDisplay}</div>
                            <img src="${getAvatarUrl(u.name, u.customAvatar)}" class="${effects.avatarEff} ${effects.frameEff}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);">
                            <div>
                                <b class="name-level-${tier} ${effects.nameEff}">${formatText(u.name)}</b>
                                <div style="font-size: 0.8rem; color: var(--text-sub); margin-top:2px;">
                                    <span class="badge-level-${tier}" style="padding: 2px 6px; border-radius: 8px; font-size: 0.7rem; color: white;">LV. ${u.level || 1}</span>
                                    • ${u.xp || 0} XP
                                </div>
                            </div>
                        </div>
                    </div>`;
            }
            html += '</div></div>';

            Swal.fire({
                title: '🏆 Bảng Xếp Hạng Tổ 1',
                html: html,
                showConfirmButton: false,
                showCloseButton: true,
                customClass: { popup: 'profile-swal' }
            }).then(() => {
                document.querySelectorAll('.podium-avatar.effect-avatar-galaxy, .leaderboard-item .effect-avatar-galaxy').forEach(el => {
                    initGalaxyEffect(el);
                });
            });
        }

        // === HỒ SƠ & HIỆU ỨNG ===
        function loadUserProfile() {
            db.ref('users/' + currentUser.emailKey).on('value', snap => {
                const u = snap.val();
                if(!u) return;
                
                const currentBadges = u.badges || [];
                let badgesDisplay = currentBadges.map(b => `<span class="user-badge ${b.class}" title="${b.name}">${b.icon}</span>`).join(' ');
                
                const ownedTags = u.ownedTags || [];
                const hiddenTags = u.hiddenTags || [];
                const equippedEffect = u.equippedEffect || 'none';
                const equippedShopEffect = u.equippedShopEffect || 'none';
                const ownedEffects = u.ownedEffects || [];
                
                let shopTagsDisplay = '';
                if(ownedTags.length > 0) {
                    ownedTags.forEach(tagId => {
                        if(hiddenTags.includes(tagId)) return;
                        const tagItem = SHOP_ITEMS.find(i => i.id === tagId);
                        if(tagItem && tagItem.type === 'tag') {
                            shopTagsDisplay += `<span class="user-badge ${tagItem.tagClass}" title="${tagItem.name}">${tagItem.icon} ${tagItem.name.replace('Tag ', '')}</span>`;
                        }
                    });
                }

                let lvTier = getLevelTier(u.level);
                const effects = getUserEffects(u);
                let effectNameClass = effects.nameEff;
                let effectAvatarClass = effects.avatarEff;
                let effectFrameClass = effects.frameEff;

                let levelHTML = `<span class="user-level badge-level-${lvTier}" title="XP: ${u.xp || 0}">LV. ${u.level || 1}</span>`;
                let moodHTML = u.mood ? `<span class="user-mood" title="Tâm trạng">${formatText(u.mood).split(' ')[0]}</span>` : '';

                document.getElementById('my-name').innerHTML = `<span class="name-level-${lvTier} ${effectNameClass}">${formatText(u.name)}</span> ${levelHTML} ${moodHTML} ${shopTagsDisplay} ${badgesDisplay}`;
                
                let avatarEl = document.getElementById('my-avatar');
                avatarEl.src = getAvatarUrl(u.name, u.customAvatar); 
                avatarEl.className = `avatar ${effectAvatarClass} ${effectFrameClass} hover-target`; 
                avatarEl.style.cursor = 'pointer';
                avatarEl.onclick = () => viewProfile(currentUser.emailKey);
                
                if (effectAvatarClass === 'effect-avatar-galaxy') {
                    initGalaxyEffect(avatarEl);
                }

                document.getElementById('my-role').innerHTML = u.role === 'admin' ? '<i class="fa-solid fa-crown"></i> Quản trị viên (Admin)' : 'Thành viên';
                document.getElementById('my-bio').innerHTML = formatText(u.bio) || "Chưa có tiểu sử. Hãy viết gì đó về bản thân nhé!";
                
                const musicContainer = document.getElementById('my-music-container');
                if (u.music) {
                    let mIcon = u.musicUrl ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-headphones"></i>';
                    let mClass = u.musicUrl ? 'user-music-status music-playable hover-target' : 'user-music-status';
                    let mClick = u.musicUrl ? `onclick="playMusicInfo(event, '${u.musicUrl}')"` : '';
                    musicContainer.innerHTML = `<span class="${mClass}" ${mClick} title="Nghe bài hát">${mIcon} Đang nghe: ${formatText(u.music)}</span>`;
                    musicContainer.style.display = 'block';
                } else { musicContainer.style.display = 'none'; }

                const streakCountEl = document.getElementById('streak-count');
                if (streakCountEl) streakCountEl.innerText = u.streak || 0;

                const createPostName = document.getElementById('create-post-author-name');
                if (createPostName) {
                    createPostName.innerHTML = `(<span class="name-level-${lvTier} ${effectNameClass}">${formatText(u.name)}</span>)`;
                }

                const xpNeeded = getXPForLevel(u.level);
                updateXPBar(u.level, u.xp || 0, xpNeeded);
            });
        }

        async function setMood() {
            const { value: mood } = await Swal.fire({
                title: 'Cảm xúc hôm nay của bạn?',
                input: 'select',
                inputOptions: {
                    '🔥 Đang cháy': '🔥 Đang cháy',
                    '😴 Buồn ngủ': '😴 Buồn ngủ',
                    '📚 Đang học': '📚 Đang học',
                    '🎮 Đang chơi': '🎮 Đang chơi',
                    '🥰 Đang yêu': '🥰 Đang yêu',
                    '😭 Sad': '😭 Sad boiz/girl',
                    '🐷 Đang ăn': '🐷 Đang ăn'
                },
                inputPlaceholder: 'Chọn tâm trạng',
                showCancelButton: true, confirmButtonColor: '#4ecdc4'
            });

            if (mood) {
                await db.ref('users/' + currentUser.emailKey).update({ mood: mood });
                Swal.fire('Đã cập nhật', `Trạng thái: ${mood}`, 'success');
            }
        }

        async function openEffectInventory() {
            const snap = await db.ref('users/' + currentUser.emailKey).once('value');
            const u = snap.val();
            const level = u.level || 1;
            const currentEff = u.equippedEffect || 'none';
            const currentShopEff = u.equippedShopEffect || 'none';
            const ownedEffects = u.ownedEffects || [];
            const ownedTags = u.ownedTags || [];
            const hiddenTags = u.hiddenTags || [];

            let optionsHTML = `<div style="text-align:left; font-size: 0.95rem; max-height: 60vh; overflow-y: auto;">
                <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 12px; border-radius: 12px; margin-bottom: 15px; text-align: center;">
                    <b>🎨 Kho Hiệu Ứng & Tag</b><br>
                    <small>Level: ${level}</small>
                </div>
            `;

            optionsHTML += `<h4 style="color: #f39c12; margin: 15px 0 10px 0; border-bottom: 2px solid #f39c12; padding-bottom: 5px;">🏆 Hiệu ứng Level (Miễn phí - 3D)</h4>`;
            optionsHTML += `<div style="margin-bottom: 10px;">
                <input type="radio" id="eff-none" name="effectRadio" value="none" ${currentEff==='none' && currentShopEff==='none' ? 'checked':''}>
                <label for="eff-none">🚫 Tắt hiệu ứng</label>
            </div>`;

            const eff1_disabled = level < 10 ? 'disabled' : '';
            const eff1_label = level >= 10 ? '✨ Avatar Glow 3D' : '🔒 Avatar Glow 3D (Lv.10)';
            optionsHTML += `<div style="margin-bottom: 10px; ${level < 10 ? 'opacity: 0.6;' : ''}">
                <input type="radio" id="eff-ava-glow" name="effectRadio" value="effect-avatar-glow" ${currentEff==='effect-avatar-glow' ? 'checked':''} ${eff1_disabled}>
                <label for="eff-ava-glow" style="color: #ffd700;">${eff1_label}</label>
            </div>`;

            const eff2_disabled = level < 25 ? 'disabled' : '';
            const eff2_label = level >= 25 ? '🌊 Avatar Hologram 3D' : '🔒 Avatar Hologram 3D (Lv.25)';
            optionsHTML += `<div style="margin-bottom: 10px; ${level < 25 ? 'opacity: 0.6;' : ''}">
                <input type="radio" id="eff-ava-holo" name="effectRadio" value="effect-avatar-hologram" ${currentEff==='effect-avatar-hologram' ? 'checked':''} ${eff2_disabled}>
                <label for="eff-ava-holo" style="color: #00f2fe;">${eff2_label}</label>
            </div>`;

            const eff3_disabled = level < 40 ? 'disabled' : '';
            const eff3_label = level >= 40 ? '⚡ Tên Điện 3D' : '🔒 Tên Điện 3D (Lv.40)';
            optionsHTML += `<div style="margin-bottom: 10px; ${level < 40 ? 'opacity: 0.6;' : ''}">
                <input type="radio" id="eff-elec" name="effectRadio" value="effect-name-electric" ${currentEff==='effect-name-electric' ? 'checked':''} ${eff3_disabled}>
                <label for="eff-elec" style="color: #f1c40f;">${eff3_label}</label>
            </div>`;

            const eff4_disabled = level < 60 ? 'disabled' : '';
            const eff4_label = level >= 60 ? '🔮 Avatar Cosmic 3D' : '🔒 Avatar Cosmic 3D (Lv.60)';
            optionsHTML += `<div style="margin-bottom: 10px; ${level < 60 ? 'opacity: 0.6;' : ''}">
                <input type="radio" id="eff-ava-cosmic" name="effectRadio" value="effect-avatar-cosmic" ${currentEff==='effect-avatar-cosmic' ? 'checked':''} ${eff4_disabled}>
                <label for="eff-ava-cosmic" style="color: #9b59b6;">${eff4_label}</label>
            </div>`;

            const eff5_disabled = level < 60 ? 'disabled' : '';
            const eff5b_disabled = level < 60 ? 'disabled' : '';
            const eff5_label = level >= 60 ? '✨ Tên Huyền Bí 3D' : '🔒 Tên Huyền Bí 3D (Lv.60)';
            optionsHTML += `<div style="margin-bottom: 10px; ${level < 60 ? 'opacity: 0.6;' : ''}">
                <input type="radio" id="eff-mystic" name="effectRadio" value="effect-name-mystic" ${currentEff==='effect-name-mystic' ? 'checked':''} ${eff5_disabled}>
                <label for="eff-mystic" style="color: #a18cd1;">${eff5_label}</label>
            </div>`;

            const eff6_disabled = level < 80 ? 'disabled' : '';
            const eff6_label = level >= 80 ? '💫 Tên Sao 3D' : '🔒 Tên Sao 3D (Lv.80)';
            optionsHTML += `<div style="margin-bottom: 10px; ${level < 80 ? 'opacity: 0.6;' : ''}">
                <input type="radio" id="eff-star" name="effectRadio" value="effect-name-star" ${currentEff==='effect-name-star' ? 'checked':''} ${eff6_disabled}>
                <label for="eff-star" style="color: #fff; text-shadow: 0 0 5px #f1c40f;">${eff6_label}</label>
            </div>`;

            const eff7_disabled = level < 100 ? 'disabled' : '';
            const eff7_label = level >= 100 ? '👑 GOD MODE 3D' : '🔒 GOD MODE 3D (Lv.100)';
            optionsHTML += `<div style="margin-bottom: 10px; ${level < 100 ? 'opacity: 0.6;' : ''}">
                <input type="radio" id="eff-god" name="effectRadio" value="effect-name-god" ${currentEff==='effect-name-god' ? 'checked':''} ${eff7_disabled}>
                <label for="eff-god" style="background: linear-gradient(45deg, #ff0000, #ff7f00, #ffff00); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: bold; font-size: 1.1rem;">${eff7_label}</label>
            </div>`;

            optionsHTML += `<div style="margin-bottom: 10px;">
                <input type="radio" id="eff-post-neon" name="effectRadio" value="effect-post-neon" ${currentEff==='effect-post-neon' ? 'checked':''}>
                <label for="eff-post-neon" style="color: #00f2fe;">💬 Khung bài viết Neon</label>
            </div>`;

            const hasShopEffects = ownedEffects.length > 0;
            if (hasShopEffects) {
                optionsHTML += `<h4 style="color: #e74c3c; margin: 20px 0 10px 0; border-bottom: 2px solid #e74c3c; padding-bottom: 5px;">✨ Khung Viền</h4>`;
                
                if (ownedEffects.includes('frame_fire')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-fire" name="effectRadio" value="frame_fire" ${currentShopEff==='frame_fire' ? 'checked':''}>
                        <label for="frame-fire" style="color: #ff4500;">🔥 Khung Lửa</label>
                    </div>`;
                }
                if (ownedEffects.includes('frame_ice')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-ice" name="effectRadio" value="frame_ice" ${currentShopEff==='frame_ice' ? 'checked':''}>
                        <label for="frame-ice" style="color: #00f2fe;">❄️ Khung Băng</label>
                    </div>`;
                }
                if (ownedEffects.includes('frame_thunder')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-thunder" name="effectRadio" value="frame_thunder" ${currentShopEff==='frame_thunder' ? 'checked':''}>
                        <label for="frame-thunder" style="color: #ffd700;">⚡ Khung Sấm</label>
                    </div>`;
                }
                if (ownedEffects.includes('frame_rainbow')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-rainbow" name="effectRadio" value="frame_rainbow" ${currentShopEff==='frame_rainbow' ? 'checked':''}>
                        <label for="frame-rainbow">🌈 Khung Cầu Vồng</label>
                    </div>`;
                }
                if (ownedEffects.includes('frame_angel')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-angel" name="effectRadio" value="frame_angel" ${currentShopEff==='frame_angel' ? 'checked':''}>
                        <label for="frame-angel" style="color: #fff; text-shadow: 0 0 5px #fbc2eb;">👼 Khung Thiên Thần</label>
                    </div>`;
                }
                if (ownedEffects.includes('frame_neon')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-neon" name="effectRadio" value="frame_neon" ${currentShopEff==='frame_neon' ? 'checked':''}>
                        <label for="frame-neon" style="color: #9b59b6;">💜 Khung Neon</label>
                    </div>`;
                }
                if (ownedEffects.includes('frame_golden')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-golden" name="effectRadio" value="frame_golden" ${currentShopEff==='frame_golden' ? 'checked':''}>
                        <label for="frame-golden" style="color: #ffd700;">💫 Khung Vàng</label>
                    </div>`;
                }
                if (ownedEffects.includes('frame_purple')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-purple" name="effectRadio" value="frame_purple" ${currentShopEff==='frame_purple' ? 'checked':''}>
                        <label for="frame-purple" style="color: #9b59b6;">💎 Khung Tím</label>
                    </div>`;
                }
                if (ownedEffects.includes('frame_nature')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-nature" name="effectRadio" value="frame_nature" ${currentShopEff==='frame_nature' ? 'checked':''}>
                        <label for="frame-nature" style="color: #2ecc71;">🌿 Khung Thiên Nhiên</label>
                    </div>`;
                }
                if (ownedEffects.includes('frame_ocean')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-ocean" name="effectRadio" value="frame_ocean" ${currentShopEff==='frame_ocean' ? 'checked':''}>
                        <label for="frame-ocean" style="color: #3498db;">🌊 Khung Đại Dương</label>
                    </div>`;
                }
            }
                }
                if (ownedEffects.includes('frame_ocean')) {
                    optionsHTML += `<div style="margin-bottom: 10px;">
                        <input type="radio" id="frame-ocean" name="effectRadio" value="frame_ocean" ${currentShopEff==='frame_ocean' ? 'checked':''}>
                        <label for="frame-ocean" style="color: #3498db;">🌊 Khung Đại Dương</label>
                    </div>`;
                }
            }

            if (ownedTags.length > 0) {
                optionsHTML += `<h4 style="color: #27ae60; margin: 20px 0 10px 0; border-bottom: 2px solid #27ae60; padding-bottom: 5px;">🏷️ Quản lý Tag đã mua</h4>`;
                
                ownedTags.forEach(tagId => {
                    const tagItem = SHOP_ITEMS.find(i => i.id === tagId);
                    if (tagItem && tagItem.type === 'tag') {
                        const isHidden = hiddenTags.includes(tagId);
                        const toggleLabel = isHidden ? '👁️ Hiện' : '🙈 Ẩn';
                        optionsHTML += `<div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; background: var(--bg-body); padding: 8px; border-radius: 8px;">
                            <span><span class="user-badge ${tagItem.tagClass}">${tagItem.icon} ${tagItem.name.replace('Tag ', '')}</span></span>
                            <button onclick="toggleTagVisibility('${tagId}')" style="padding: 4px 10px; border: none; border-radius: 5px; cursor: pointer; background: ${isHidden ? '#95a5a6' : '#27ae60'}; color: white; font-size: 0.75rem;">${toggleLabel}</button>
                        </div>`;
                    }
                });
            }

            optionsHTML += `</div>`;

            const { value: selectedEffect } = await Swal.fire({
                title: '✨ Kho Khung Viền & Tag',
                html: optionsHTML,
                showCancelButton: true, confirmButtonColor: '#27ae60', confirmButtonText: 'Trang bị',
                preConfirm: () => { 
                    const checked = document.querySelector('input[name="effectRadio"]:checked');
                    return checked ? checked.value : 'none'; 
                }
            });

            if (selectedEffect) {
                if (selectedEffect === 'none') {
                    await db.ref('users/' + currentUser.emailKey).update({ equippedEffect: null, equippedShopEffect: null });
                } else if (selectedEffect.startsWith('shop_')) {
                    await db.ref('users/' + currentUser.emailKey).update({ equippedEffect: null, equippedShopEffect: selectedEffect });
                } else {
                    await db.ref('users/' + currentUser.emailKey).update({ equippedEffect: selectedEffect, equippedShopEffect: null });
                }
                Swal.fire('Thành công', 'Đã thay đổi hiệu ứng!', 'success');
            }
        }

        async function toggleTagVisibility(tagId) {
            const snap = await db.ref('users/' + currentUser.emailKey).once('value');
            const u = snap.val();
            const hiddenTags = u.hiddenTags || [];
            
            let newHiddenTags;
            if (hiddenTags.includes(tagId)) {
                newHiddenTags = hiddenTags.filter(t => t !== tagId);
            } else {
                newHiddenTags = [...hiddenTags, tagId];
            }
            
            await db.ref('users/' + currentUser.emailKey).update({ hiddenTags: newHiddenTags });
            openEffectInventory();
        }

        async function gainXP(amount) {
            const userRef = db.ref('users/' + currentUser.emailKey);
            const snap = await userRef.once('value');
            let u = snap.val();
            let currentXP = u.xp || 0;
            let currentLevel = u.level || 1;

            let newXP = currentXP + amount;
            let newLevel = currentLevel;
            let xpNeeded = getXPForLevel(newLevel);
            
            while (newXP >= xpNeeded) {
                newXP -= xpNeeded;
                newLevel++;
                xpNeeded = getXPForLevel(newLevel);
            }

            let updates = { xp: newXP, level: newLevel };
            if (newLevel > currentLevel) {
                setTimeout(() => {
                    Swal.fire({
                        title: 'LÊN CẤP!',
                        html: `<b style="font-size:1.5rem; color:#4ecdc4;">🎉 Level ${newLevel} 🎉</b><br><small>Cần ${xpNeeded} XP để lên cấp tiếp theo</small>`,
                        icon: 'success',
                        backdrop: `rgba(0,0,123,0.4) url("https://media.giphy.com/media/UDjF1zMHC8LQM/giphy.gif") left top no-repeat`
                    });
                }, 1000);
            }
            await userRef.update(updates);
            updateXPBar(newLevel, newXP, xpNeeded);
        }

        function updateXPBar(level, currentXP, xpNeeded) {
            const xpBarContainer = document.getElementById('xp-bar-container');
            if (!xpBarContainer) return;
            
            const xpForCurrentLevel = getXPForLevel(level);
            const xpFromPrevLevels = level === 1 ? 0 : (function() {
                let total = 0;
                for (let i = 1; i < level; i++) {
                    let tier = getLevelTier(i);
                    if (tier === 1) total += 100;
                    else if (tier === 2) total += 200;
                    else if (tier === 3) total += 350;
                    else if (tier === 4) total += 500;
                    else total += 750;
                }
                return total;
            })();
            
            const xpAtLevelStart = xpFromPrevLevels;
            const xpAtNextLevel = xpAtLevelStart + xpForCurrentLevel;
            const progress = ((currentXP - xpAtLevelStart) / xpForCurrentLevel) * 100;
            const remainingXP = xpForCurrentLevel - (currentXP - xpAtLevelStart);
            const percentage = Math.min(Math.max(progress, 0), 100);
            
            xpBarContainer.innerHTML = `
                <div class="xp-bar-wrapper">
                    <div class="xp-bar-info">
                        <span class="xp-level">Lv.${level}</span>
                        <span class="xp-text">Cần ${remainingXP} XP để lên cấp</span>
                    </div>
                    <div class="xp-bar-bg">
                        <div class="xp-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;
        }

        function showStreakAnimation(streakVal) {
            const fireContainer = document.createElement('div');
            fireContainer.className = 'streak-fire-container';
            fireContainer.innerHTML = `
                <div class="streak-fire">🔥</div>
                <div class="streak-text">${streakVal} Ngày Chuỗi!</div>
            `;
            document.body.appendChild(fireContainer);
            
            clickSound.currentTime = 0; clickSound.play().catch(()=>{});

            setTimeout(() => { fireContainer.remove(); }, 2000);
        }

        async function updateStreak() {
            const userRef = db.ref('users/' + currentUser.emailKey);
            const snap = await userRef.once('value');
            let u = snap.val();
            let currentStreak = u.streak || 0;
            let lastStreakDate = u.lastStreakDate || "";
            
            const today = new Date().toLocaleDateString('vi-VN');
            if (lastStreakDate === today) return; 
            
            let yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('vi-VN');

            let newStreak = 1; 
            if (lastStreakDate === yesterdayStr) {
                newStreak = currentStreak + 1; 
            }

            await userRef.update({ streak: newStreak, lastStreakDate: today });
            showStreakAnimation(newStreak); 
        }

        function showStreakInfo() {
            Swal.fire({
                title: '🔥 Chuỗi Tương Tác',
                text: 'Hãy đăng bài hoặc bình luận mỗi ngày để duy trì và tăng chuỗi của bạn nhé!',
                icon: 'info', confirmButtonColor: '#ff9800'
            });
        }

        async function editProfile() {
            const snap = await db.ref('users/' + currentUser.emailKey).once('value');
            const u = snap.val();
            
            const htmlForm = `
                <div class="edit-profile-container">
                    <div class="edit-avatar-container hover-target">
                        <label>🖼️ Ảnh đại diện (Chọn ảnh mới để đổi)</label>
                        <input type="file" id="edit-avatar" accept="image/*">
                    </div>
                    <div class="edit-input-group">
                        <label>📝 Tiểu sử của bạn</label>
                        <textarea id="edit-bio" rows="3" placeholder="Viết gì đó thật ngầu về bản thân...">${formatText(u.bio)}</textarea>
                    </div>
                    <div class="edit-input-group">
                        <label>🎂 Ngày sinh</label>
                        <input type="date" id="edit-dob" value="${formatText(u.dob)}">
                    </div>
                    <div class="edit-input-group">
                        <label>🏡 Quê quán</label>
                        <input type="text" id="edit-hometown" placeholder="Bạn sinh ra ở đâu?" value="${formatText(u.hometown)}">
                    </div>
                    <div class="edit-input-group">
                        <label>📍 Địa chỉ hiện tại</label>
                        <input type="text" id="edit-address" placeholder="Nơi bạn đang sống" value="${formatText(u.address)}">
                    </div>
                    <div class="edit-input-group">
                        <label>🏫 Trường học</label>
                        <input type="text" id="edit-school" placeholder="Tên trường học" value="${formatText(u.school)}">
                    </div>
                    <div class="edit-input-group">
                        <label>🎓 Lớp</label>
                        <input type="text" id="edit-class" placeholder="VD: 12A1" value="${formatText(u.class_name)}">
                    </div>
                </div>
            `;
            
            const result = await Swal.fire({
                title: 'Cập nhật hồ sơ ✨', 
                html: htmlForm, 
                showCancelButton: true, 
                confirmButtonColor: '#4ecdc4', 
                confirmButtonText: 'Lưu thay đổi', 
                cancelButtonText: 'Hủy',
                preConfirm: async () => {
                    const bio = document.getElementById('edit-bio').value.trim();
                    const dob = document.getElementById('edit-dob').value;
                    const hometown = document.getElementById('edit-hometown').value.trim();
                    const address = document.getElementById('edit-address').value.trim();
                    const school = document.getElementById('edit-school').value.trim();
                    const class_name = document.getElementById('edit-class').value.trim();

                    const avatarFile = document.getElementById('edit-avatar').files[0];
                    let customAvatarUrl = u.customAvatar || null;

                    if (avatarFile) {
                        Swal.showLoading();
                        try {
                            const compressed = await compressImage(avatarFile, 800, 800, 0.7);
                            const formData = new FormData();
                            formData.append("image", compressed);
                            const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
                            const imgData = await imgRes.json();
                            if(imgData.success) customAvatarUrl = imgData.data.url;
                        } catch(e) { console.error("Lỗi up ảnh", e); }
                    }

                    return { bio, dob, hometown, address, school, class_name, customAvatar: customAvatarUrl };
                }
            });
            
            if (result.isConfirmed) {
                await db.ref('users/' + currentUser.emailKey).update(result.value);
                Swal.fire('Thành công', 'Đã cập nhật hồ sơ!', 'success');
            }
        }

        async function viewProfile(targetKey) {
            if(!targetKey || targetKey === 'undefined') return Swal.fire("Lỗi", "Tài khoản không tồn tại.", "error");
            const snap = await db.ref('users/' + targetKey).once('value');
            const targetUser = snap.val();
            if(!targetUser) return;
            const isMe = targetKey === currentUser.emailKey;
            const isAdmin = currentUser.role === 'admin';

            const isFriend = await db.ref(`users/${currentUser.emailKey}/friends/${targetKey}`).once('value').then(s => s.exists());
            const isSent = await db.ref(`users/${targetKey}/friendRequests/${currentUser.emailKey}`).once('value').then(s => s.exists());
            let btnHTML = '';
            if(!isMe) {
                if(isFriend) btnHTML = `<button class="btn-post hover-target" style="background:#ff6b6b; width:100%" onclick="unfriend('${targetKey}', '${targetUser.name}')">❌ Xóa kết bạn</button>`;
                else if(isSent) btnHTML = '<button class="btn-post" style="background:#aaa; width:100%" disabled>⏳ Đang chờ phản hồi</button>';
                else btnHTML = `<button class="btn-post hover-target" style="width:100%" onclick="sendFriendRequest('${targetKey}', '${targetUser.name}')">➕ Kết bạn</button>`;
            } else { btnHTML = '<button class="btn-post" style="background:#ccc; width:100%" disabled>Đây là hồ sơ của bạn</button>'; }

            const currentBadges = targetUser.badges || [];
            let badgesDisplay = currentBadges.map((b, index) => {
                const removeBtn = isAdmin ? `<div class="btn-remove-badge" onclick="event.stopPropagation(); deleteBadge('${targetKey}', ${index}, '${b.name}')">×</div>` : '';
                return `<div class="badge-container">${removeBtn}<span class="user-badge ${b.class}" title="${b.name}">${b.icon} ${b.name}</span></div>`;
            }).join('');

            const ownedTags = targetUser.ownedTags || [];
            const targetHiddenTags = targetUser.hiddenTags || [];
            let shopTagsDisplay = '';
            if(ownedTags.length > 0) {
                ownedTags.forEach(tagId => {
                    if(targetHiddenTags.includes(tagId)) return;
                    const tagItem = SHOP_ITEMS.find(i => i.id === tagId);
                    if(tagItem && tagItem.type === 'tag') {
                        shopTagsDisplay += `<span class="user-badge ${tagItem.tagClass}">${tagItem.icon} ${tagItem.name.replace('Tag ', '')}</span>`;
                    }
                });
            }
            
            let targetTier = getLevelTier(targetUser.level);
            const targetEffects = getUserEffects(targetUser);
            let effectNameClass = targetEffects.nameEff;
            let effectAvatarClass = targetEffects.avatarEff;
            let effectFrameClass = targetEffects.frameEff;

            let levelHTML = `<span class="user-level badge-level-${targetTier}" style="font-size:0.9rem">LV. ${targetUser.level || 1}</span>`;
            let moodHTML = targetUser.mood ? `<br><span style="font-size:1rem; color:#d35400">${formatText(targetUser.mood)}</span>` : '';
            
            let musicHTML = '';
            if (targetUser.music) {
                let mIcon = targetUser.musicUrl ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-headphones"></i>';
                let mClass = targetUser.musicUrl ? 'user-music-status music-playable hover-target' : 'user-music-status';
                let mClick = targetUser.musicUrl ? `onclick="playMusicInfo(event, '${targetUser.musicUrl}')"` : '';
                musicHTML = `<br><span class="${mClass}" style="margin-top:5px;" ${mClick} title="Nghe bài hát">${mIcon} Đang nghe: ${formatText(targetUser.music)}</span>`;
            }

            let adminTools = '';
            if (isAdmin && !isMe) {
                adminTools = `<button class="btn-comment hover-target" style="width:100%; margin-top:10px; background:#764ba2;" onclick="awardBadgePrompt('${targetKey}', '${targetUser.name}')">👑 Trao Huy Hiệu Đặc Biệt</button>`;
            }
            
            let achievementsHTML = '<h4 style="text-align:left; margin-top:20px; color:#4ecdc4;"><i class="fa-solid fa-trophy"></i> Bảng Thành Tựu</h4>';
            achievementsHTML += '<div class="achievements-grid">';
            ACHIEVEMENTS.forEach(ach => {
                const isUnlocked = currentBadges.some(b => b.name === ach.name);
                const cardClass = isUnlocked ? 'achievement-card unlocked hover-target' : 'achievement-card';
                achievementsHTML += `
                    <div class="${cardClass}" title="${isUnlocked ? 'Đã mở khóa!' : 'Chưa mở khóa'}">
                        <div class="ach-icon">${ach.icon}</div>
                        <div class="ach-name">${ach.name}</div>
                        <div class="ach-desc">${ach.desc}</div>
                    </div>
                `;
            });
            achievementsHTML += '</div>';

            const postsSnap = await db.ref('posts').orderByChild('emailKey').equalTo(targetKey).once('value');
            const userPosts = postsSnap.val();
            let postsHTML = '<h4 style="text-align:left; margin-top:20px; color:#ff6b6b;"><i class="fa-solid fa-book"></i> Bài viết đã đăng</h4><div class="user-posts-container">';
            if(userPosts) {
                Object.keys(userPosts).map(k => ({id: k, ...userPosts[k]})).reverse().forEach(p => {
                    let img = p.image_url ? `<img src="${p.image_url}" style="width:100%; border-radius:8px; margin-top:10px;">` : '';
                    postsHTML += `<div class="user-post-item"><small style="color:#888;">${p.time}</small><p>${formatText(p.content)}</p>${img}</div>`;
                });
            } else { postsHTML += '<p style="color:#888; font-style:italic;">Chưa đăng bài nào.</p>'; }
            postsHTML += '</div>';

            Swal.fire({
                title: `<span class="name-level-${targetTier} ${effectNameClass}">${formatText(targetUser.name)}</span>`,
                customClass: { popup: 'profile-swal' },
                html: `<img src="${getAvatarUrl(targetUser.name, targetUser.customAvatar)}" class="${effectAvatarClass} ${effectFrameClass}" id="profile-view-avatar" style="width:110px; height: 110px; object-fit: cover; border-radius:50%; border: 4px solid #ff6b6b;">
                    <div style="margin: 5px 0;">${levelHTML} ${shopTagsDisplay} ${badgesDisplay}</div>
                    ${moodHTML} ${musicHTML}
                    <p style="margin-top:10px;"><b>Vai trò:</b> ${targetUser.role === 'admin' ? '👑 Admin' : 'Thành viên'}</p>
                    <p style="color:#666; font-style:italic;">"${formatText(targetUser.bio) || 'Chưa có tiểu sử'}"</p>
                    <div class="profile-details">
                        <p><b>🎂 Ngày sinh:</b> ${formatText(targetUser.dob) || 'Chưa cập nhật'}</p>
                        <p><b>🏡 Quê quán:</b> ${formatText(targetUser.hometown) || 'Chưa cập nhật'}</p>
                    </div>${btnHTML}${adminTools}
                    ${achievementsHTML}
                    <hr>${postsHTML}`,
                showConfirmButton: false, showCloseButton: true
            }).then(() => {
                if (effectAvatarClass === 'effect-avatar-galaxy') {
                    const avatarEl = document.getElementById('profile-view-avatar');
                    if (avatarEl) initGalaxyEffect(avatarEl);
                }
            });
        }

        async function showFriendsList() {
            const snap = await db.ref(`users/${currentUser.emailKey}/friends`).once('value');
            const friends = snap.val();
            if (!friends) return Swal.fire("Thông báo", "Bạn chưa có bạn bè.", "info");

            let html = '<div style="max-height: 400px; overflow-y: auto; text-align: left;">';
            for (let fKey of Object.keys(friends)) {
                const uSnap = await db.ref(`users/${fKey}`).once('value');
                const uData = uSnap.val();
                if (uData) {
                    const onlineDot = uData.online ? '<div class="online-dot"></div>' : '';
                    const moodIcon = uData.mood ? formatText(uData.mood).split(' ')[0] : '';
                    let friendTier = getLevelTier(uData.level);
                    const friendEffects = getUserEffects(uData);

                    html += `
                        <div class="friend-list-item hover-target">
                            <div class="friend-list-info" onclick="Swal.close(); viewProfile('${fKey}')">
                                <div style="position:relative;">
                                    <img src="${getAvatarUrl(uData.name, uData.customAvatar)}" class="${friendEffects.avatarEff} ${friendEffects.frameEff}">
                                    ${onlineDot}
                                </div>
                                <b><span class="name-level-${friendTier} ${friendEffects.nameEff}">${formatText(uData.name)}</span> ${moodIcon}</b>
                            </div>
                            <button onclick="unfriend('${fKey}', '${uData.name}')" style="background:none; border:none; color:#ff6b6b; cursor:pointer;" class="hover-target"><i class="fa-solid fa-user-xmark"></i></button>
                        </div>`;
                }
            }
            html += '</div>';
            Swal.fire({ title: 'Danh sách bạn bè', html: html, showConfirmButton: false, showCloseButton: true });
        }

        function unfriend(targetKey, targetName) {
            Swal.fire({ title: 'Xóa kết bạn?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ff6b6b', confirmButtonText: 'Xóa!' }).then(async (result) => {
                if (result.isConfirmed) {
                    await db.ref(`users/${currentUser.emailKey}/friends/${targetKey}`).remove();
                    await db.ref(`users/${targetKey}/friends/${currentUser.emailKey}`).remove();
                    if(Swal.getTitle() && Swal.getTitle().innerText === 'Danh sách bạn bè') showFriendsList();
                }
            });
        }

        async function sendFriendRequest(key, name) { 
            await db.ref(`users/${key}/friendRequests/${currentUser.emailKey}`).set({
                fromName: currentUser.name, 
                time: new Date().toLocaleString('vi-VN')
            }); 
            Swal.fire({
                title: 'Đã gửi lời mời!',
                text: `Đang chờ ${name} phản hồi...`,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                viewProfile(key);
            });
        }

        async function acceptFriend(k) { await db.ref(`users/${currentUser.emailKey}/friends/${k}`).set(true); await db.ref(`users/${k}/friends/${currentUser.emailKey}`).set(true); db.ref(`users/${currentUser.emailKey}/friendRequests/${k}`).remove(); }
        function rejectFriend(k) { db.ref(`users/${currentUser.emailKey}/friendRequests/${k}`).remove(); Swal.close(); }

        // === 5. HỆ THỐNG LẮNG NGHE THÔNG BÁO ===
        function listenAllNotifications() {
            const reqRef = db.ref(`users/${currentUser.emailKey}/friendRequests`);
            const notiRef = db.ref(`users/${currentUser.emailKey}/notifications`);

            let reqCount = 0; let notiCount = 0;

            const updateBadge = () => {
                const total = reqCount + notiCount;
                const badge = document.getElementById('noti-badge');
                badge.innerText = total; badge.style.display = total > 0 ? 'block' : 'none';
                
                if (total > previousNotifCount && total > 0) { 
                    discordSound.currentTime = 0; discordSound.play().catch(()=>{}); 
                }
                previousNotifCount = total;
            };

            reqRef.on('value', snap => { reqCount = snap.numChildren(); updateBadge(); });
            notiRef.on('value', snap => {
                notiCount = 0;
                snap.forEach(child => { if (!child.val().isRead) notiCount++; });
                updateBadge();
            });
        }
        
        async function showNotifications() {
            const snapReq = await db.ref(`users/${currentUser.emailKey}/friendRequests`).once('value');
            const snapNoti = await db.ref(`users/${currentUser.emailKey}/notifications`).once('value');

            let html = '<div style="text-align:left; max-height:400px; overflow-y:auto; padding-right:5px;">';

            const reqs = snapReq.val();
            if(reqs) {
                html += '<h4 style="color:#ff6b6b; margin-top:0; border-bottom: 2px solid #eeeeee; padding-bottom:5px;">Lời mời kết bạn</h4>';
                Object.keys(reqs).forEach(key => {
                    html += `<div style="display:flex; justify-content:space-between; margin-bottom:10px; background:#f4f7f6; padding:10px; border-radius:10px;">
                        <span onclick="Swal.close(); viewProfile('${key}')" class="hover-target" style="cursor:pointer"><b>${formatText(reqs[key].fromName)}</b> gửi lời mời</span>
                        <div>
                            <button onclick="acceptFriend('${key}')" style="background:#4ecdc4; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;" class="hover-target">✅</button>
                            <button onclick="rejectFriend('${key}')" style="background:#ff6b6b; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;" class="hover-target">❌</button>
                        </div>
                    </div>`;
                });
            }

            const notis = snapNoti.val();
            if(notis) {
                html += '<h4 style="color:#4ecdc4; margin-top:20px; border-bottom: 2px solid #eeeeee; padding-bottom:5px;">Thông báo tương tác</h4>';
                const notiList = Object.keys(notis).map(k => ({id: k, ...notis[k]})).reverse();
                notiList.forEach(n => {
                    let actionText = n.type === 'reaction' ? `đã bày tỏ cảm xúc ${n.reaction} về bài viết của bạn.` : `đã bình luận về bài viết của bạn.`;
                    let bg = n.isRead ? 'transparent' : '#e0f7fa'; 
                    html += `<div class="hover-target" style="margin-bottom:10px; padding:10px; border-radius:10px; background:${bg}; border: 1px solid #eee; cursor:pointer;">
                        <b>${formatText(n.fromName)}</b> ${actionText} <br><small style="color:#888;">${n.time}</small>
                    </div>`;
                    
                    if (!n.isRead) { db.ref(`users/${currentUser.emailKey}/notifications/${n.id}/isRead`).set(true); }
                });
            }

            if(!reqs && !notis) { html += '<p style="text-align:center; color:#888;">Bạn chưa có thông báo nào.</p>'; }
            html += '</div>';

            Swal.fire({ title: 'Bảng Thông Báo 🔔', html: html, showConfirmButton: false, showCloseButton: true });
        }

        // === LIGHTBOX ===
        function openLightbox(imgSrc) {
            const lightbox = document.getElementById('lightbox');
            const lightboxImg = document.getElementById('lightbox-img');
            lightbox.style.display = "block";
            lightboxImg.src = imgSrc;
            document.body.style.overflow = "hidden";
        }

        function closeLightbox() {
            document.getElementById('lightbox').style.display = "none";
            document.body.style.overflow = "auto";
        }
        document.addEventListener('keydown', function(event){ if(event.key === "Escape") closeLightbox(); });

        // === 6. BẢNG TIN REAL-TIME VÀ AVATAR ===
        function searchPosts() {
            const filter = document.getElementById('searchInput').value.toLowerCase();
            const posts = document.getElementsByClassName('post-card');
            for (let i = 0; i < posts.length; i++) {
                posts[i].style.display = posts[i].innerText.toLowerCase().includes(filter) ? "" : "none";
            }
        }

        function toggleComments(postId, hiddenCount) {
            const hiddenElements = document.querySelectorAll(`.hidden-comment-${postId}`);
            const btn = document.getElementById(`toggle-comments-${postId}`);
            let isExpanded = btn.getAttribute('data-expanded') === 'true';

            if (isExpanded) {
                hiddenElements.forEach(el => el.classList.add('comment-hidden'));
                btn.innerText = `Xem thêm ${hiddenCount} bình luận...`;
                btn.setAttribute('data-expanded', 'false');
            } else {
                hiddenElements.forEach(el => el.classList.remove('comment-hidden'));
                btn.innerText = `Ẩn bớt bình luận`;
                btn.setAttribute('data-expanded', 'true');
            }
        }

        // Cached users data for posts
        let cachedUsersData = null;
        let usersDataLastFetch = 0;
        const USERS_CACHE_DURATION = 30000; // 30 seconds cache

        async function getCachedUsersData() {
            const now = Date.now();
            if (!cachedUsersData || (now - usersDataLastFetch) > USERS_CACHE_DURATION) {
                const usersSnap = await db.ref('users').once('value');
                cachedUsersData = usersSnap.val() || {};
                usersDataLastFetch = now;
            }
            return cachedUsersData;
        }

        // Render posts with optimized string building
        function renderPostHTML(post, usersData) {
            const commentsObj = post.comments || {};
            const commentsArray = Object.values(commentsObj);
            
            let viewMoreHTML = '';
            if (commentsArray.length > 2) {
                let hiddenCount = commentsArray.length - 2;
                viewMoreHTML = `<div class="view-more-comments hover-target" id="toggle-comments-${post.id}" data-expanded="false">Xem thêm ${hiddenCount} bình luận...</div>`;
            }

            const commentsHTML = commentsArray.map((c, index) => {
                let cTier = 1;
                let cNameEffect = '';
                const userC = usersData[c.emailKey];
                if (userC) {
                    cTier = getLevelTier(userC.level);
                    cNameEffect = getUserEffects(userC).nameEff;
                }
                
                let hiddenClass = (index >= 2) ? `comment-hidden hidden-comment-${post.id}` : '';
                return `<div class="comment-item ${hiddenClass}"><div class="comment-box"><b class="name-level-${cTier} ${cNameEffect}">${formatText(c.author)}:</b> ${formatText(c.text)}</div></div>`;
            }).join('');
            
            let deleteBtnHTML = (currentUser.role === 'admin' || post.emailKey === currentUser.emailKey) ? 
                `<button class="btn-delete hover-target" data-action="delete" data-post="${post.id}" title="Xóa bài viết"><i class="fa-solid fa-trash"></i></button>` : '';
            let editBtnHTML = (post.emailKey === currentUser.emailKey) ? 
                `<button class="btn-edit hover-target" data-action="edit" data-post="${post.id}" title="Chỉnh sửa bài viết"><i class="fa-solid fa-pen"></i></button>` : '';
            let imageHTML = (post.image_url) ? 
                `<img src="${post.image_url}" class="post-image hover-target" loading="lazy" style="cursor:zoom-in;">` : '';

            const reactionsObj = post.reactions || {};
            const myReact = reactionsObj[currentUser.emailKey];
            const reactCount = Object.keys(reactionsObj).length;
            const displayIcon = myReact ? myReact : '🤍';
            const activeClass = myReact ? 'liked' : '';

            const user = usersData[post.emailKey] || {};
            const authorAvatar = getAvatarUrl(post.author, user.customAvatar);
            
            const userBadges = user.badges || [];
            let badgesHTML = userBadges.map(b => `<span class="user-badge ${b.class}" title="${b.name}">${b.icon}</span>`).join('');
            
            const userOwnedTags = user.ownedTags || [];
            const userHiddenTags = user.hiddenTags || [];
            let shopTagsHTML = '';
            if(userOwnedTags.length > 0) {
                userOwnedTags.forEach(tagId => {
                    if(userHiddenTags.includes(tagId)) return;
                    const tagItem = SHOP_ITEMS.find(i => i.id === tagId);
                    if(tagItem && tagItem.type === 'tag') {
                        shopTagsHTML += `<span class="user-badge ${tagItem.tagClass}" style="font-size:0.7rem; margin-left:2px;">${tagItem.icon}</span>`;
                    }
                });
            }

            let authorTier = getLevelTier(user.level);
            const postEffects = getUserEffects(user);
            let effectNameClass = postEffects.nameEff;
            let effectAvatarClass = postEffects.avatarEff;
            let effectPostClass = postEffects.postEff;
            let effectFrameClass = postEffects.frameEff;

            let levelHTML = `<span class="user-level badge-level-${authorTier}" title="LV">LV.${user.level || 1}</span>`;
            let moodHTML = user.mood ? `<span class="user-mood" style="font-size:1rem">${formatText(user.mood).split(' ')[0]}</span>` : '';
            
            let musicHTML = '';
            if (user.music) {
                let mIcon = user.musicUrl ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-headphones"></i>';
                let mClass = user.musicUrl ? 'user-music-status music-playable' : 'user-music-status';
                musicHTML = `<span class="${mClass}" title="Đang nghe: ${formatText(user.music)}">${mIcon} ${formatText(user.music)}</span>`;
            }

            const editedText = post.edited ? ' <i style="color:#aaa; font-size: 0.75rem;">(đã chỉnh sửa)</i>' : '';

            return `
                <div class="post-card ${effectPostClass}" id="post-${post.id}">
                    ${editBtnHTML}
                    ${deleteBtnHTML}
                    <div class="post-header hover-target">
                        <img src="${authorAvatar}" class="post-avatar ${effectAvatarClass} ${effectFrameClass}" data-action="viewProfile" data-email="${post.emailKey}">
                        <div class="post-info">
                            <h4 data-action="viewProfile" data-email="${post.emailKey}">
                                <span class="name-level-${authorTier} ${effectNameClass}">${formatText(post.author)}</span> 
                                ${levelHTML} ${shopTagsHTML} ${moodHTML} ${badgesHTML} ${musicHTML}
                            </h4>
                            <span style="display:block;">${post.time}${editedText}</span>
                        </div>
                    </div>
                    <div class="post-content">${formatText(post.content)}</div>
                    ${imageHTML}
                    <div class="post-actions">
                        <button class="action-btn ${activeClass}" data-action="react" data-post="${post.id}" data-react="${myReact ? '' : '❤️'}">
                            ${displayIcon} ${reactCount > 0 ? reactCount : ''} Thích
                            <div class="reaction-popup">
                                <span data-action="react" data-post="${post.id}" data-react="👍">👍</span>
                                <span data-action="react" data-post="${post.id}" data-react="❤️">❤️</span>
                                <span data-action="react" data-post="${post.id}" data-react="😂">😂</span>
                                <span data-action="react" data-post="${post.id}" data-react="😮">😮</span>
                                <span data-action="react" data-post="${post.id}" data-react="😢">😢</span>
                            </div>
                        </button>
                        <button class="action-btn hover-target" data-action="focusComment" data-post="${post.id}">💬 Bình luận (${commentsArray.length})</button>
                    </div>
                    <div class="comment-section">
                        ${viewMoreHTML}
                        <div id="comment-list-${post.id}">${commentsHTML}</div>
                        <div class="add-comment-box">
                            <input type="text" id="input-${post.id}" class="comment-input hover-target" placeholder="Viết bình luận...">
                            <button class="btn-comment hover-target" data-action="comment" data-post="${post.id}">Gửi</button>
                        </div>
                    </div>
                </div>`;
        }

        // Throttled posts listener
        let postsLastUpdate = 0;
        const POSTS_UPDATE_DELAY = 500;

        function listenPosts() {
            db.ref('posts').on('value', async (snapshot) => {
                const now = Date.now();
                if (now - postsLastUpdate < POSTS_UPDATE_DELAY) return;
                postsLastUpdate = now;

                const postsArea = document.getElementById('posts-area');
                const data = snapshot.val();
                if (!data) { 
                    postsArea.innerHTML = "<p style='text-align: center;'>Chưa có bài viết nào.</p>"; 
                    return; 
                }
                
                const usersData = await getCachedUsersData();
                const postList = Object.keys(data).map(key => ({ id: key, ...data[key] })).reverse();

                // Build all HTML at once
                const allPostsHTML = postList.map(post => renderPostHTML(post, usersData)).join('');
                postsArea.innerHTML = allPostsHTML;

                // Initialize galaxy effects
                postList.forEach(post => {
                    const user = usersData[post.emailKey] || {};
                    const effects = getUserEffects(user);
                    if (effects.avatarEff === 'effect-avatar-galaxy') {
                        const postAvatarEl = document.querySelector(`#post-${post.id} .post-avatar`);
                        if (postAvatarEl) initGalaxyEffect(postAvatarEl);
                    }
                });

                // Lazy load images
                PerfUtils.lazyLoadImages();
            });
        }
                
                const usersSnap = await db.ref('users').once('value');
                const usersData = usersSnap.val() || {};

                postsArea.innerHTML = "";
                const postList = Object.keys(data).map(key => ({ id: key, ...data[key] })).reverse();

                postList.forEach(post => {
                    const commentsObj = post.comments || {};
                    const commentsArray = Object.values(commentsObj);
                    
                    let viewMoreHTML = '';
                    if (commentsArray.length > 2) {
                        let hiddenCount = commentsArray.length - 2;
                        viewMoreHTML = `<div class="view-more-comments hover-target" id="toggle-comments-${post.id}" data-expanded="false" onclick="toggleComments('${post.id}', ${hiddenCount})">Xem thêm ${hiddenCount} bình luận...</div>`;
                    }

                    const commentsHTML = commentsArray.map((c, index) => {
                        let cTier = 1;
                        let cNameEffect = '';
                        if (c.emailKey && usersData[c.emailKey]) {
                            cTier = getLevelTier(usersData[c.emailKey].level);
                            cNameEffect = getUserEffects(usersData[c.emailKey]).nameEff;
                        } else {
                            let foundKey = Object.keys(usersData).find(k => usersData[k].name === c.author);
                            if(foundKey) {
                                cTier = getLevelTier(usersData[foundKey].level);
                                cNameEffect = getUserEffects(usersData[foundKey]).nameEff;
                            }
                        }
                        
                        let hiddenClass = (index >= 2) ? `comment-hidden hidden-comment-${post.id}` : '';
                        return `<div class="comment-item ${hiddenClass}"><div class="comment-box"><b class="name-level-${cTier} ${cNameEffect}">${formatText(c.author)}:</b> ${formatText(c.text)}</div></div>`;
                    }).join('');
                    
                    let deleteBtnHTML = (currentUser.role === 'admin' || post.emailKey === currentUser.emailKey) ? 
                        `<button class="btn-delete hover-target" onclick="deletePost('${post.id}')" title="Xóa bài viết"><i class="fa-solid fa-trash"></i></button>` : '';
                    let editBtnHTML = (post.emailKey === currentUser.emailKey) ? 
                        `<button class="btn-edit hover-target" onclick="editPost('${post.id}')" title="Chỉnh sửa bài viết"><i class="fa-solid fa-pen"></i></button>` : '';
                    let imageHTML = (post.image_url) ? 
                        `<img src="${post.image_url}" class="post-image hover-target" style="cursor:zoom-in;" onclick="openLightbox('${post.image_url}')">` : '';

                    const reactionsObj = post.reactions || {};
                    const myReact = reactionsObj[currentUser.emailKey];
                    const reactCount = Object.keys(reactionsObj).length;
                    const displayIcon = myReact ? myReact : '🤍';
                    const activeClass = myReact ? 'liked' : '';

                    const user = usersData[post.emailKey] || {};
                    const authorAvatar = getAvatarUrl(post.author, user.customAvatar);
                    
                    const userBadges = user.badges || [];
                    let badgesHTML = userBadges.map(b => `<span class="user-badge ${b.class}" title="${b.name}">${b.icon}</span>`).join('');
                    
                    const userOwnedTags = user.ownedTags || [];
                    const userHiddenTags = user.hiddenTags || [];
                    let shopTagsHTML = '';
                    if(userOwnedTags.length > 0) {
                        userOwnedTags.forEach(tagId => {
                            if(userHiddenTags.includes(tagId)) return;
                            const tagItem = SHOP_ITEMS.find(i => i.id === tagId);
                            if(tagItem && tagItem.type === 'tag') {
                                shopTagsHTML += `<span class="user-badge ${tagItem.tagClass}" style="font-size:0.7rem; margin-left:2px;">${tagItem.icon}</span>`;
                            }
                        });
                    }

                    let authorTier = getLevelTier(user.level);
                    const postEffects = getUserEffects(user);
                    let effectNameClass = postEffects.nameEff;
                    let effectAvatarClass = postEffects.avatarEff;
                    let effectPostClass = postEffects.postEff;
                    let effectFrameClass = postEffects.frameEff;

                    let levelHTML = `<span class="user-level badge-level-${authorTier}" title="LV">LV.${user.level || 1}</span>`;
                    let moodHTML = user.mood ? `<span class="user-mood" style="font-size:1rem">${formatText(user.mood).split(' ')[0]}</span>` : '';
                    
                    let musicHTML = '';
                    if (user.music) {
                        let mIcon = user.musicUrl ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-headphones"></i>';
                        let mClass = user.musicUrl ? 'user-music-status music-playable' : 'user-music-status';
                        let mClick = user.musicUrl ? `onclick="playMusicInfo(event, '${user.musicUrl}')"` : '';
                        musicHTML = `<span class="${mClass}" title="Đang nghe: ${formatText(user.music)}" ${mClick}>${mIcon} ${formatText(user.music)}</span>`;
                    }

                    const editedText = post.edited ? ' <i style="color:#aaa; font-size: 0.75rem;">(đã chỉnh sửa)</i>' : '';

                    const postHTML = `
                        <div class="post-card ${effectPostClass}" id="post-${post.id}">
                            ${editBtnHTML}
                            ${deleteBtnHTML}
                            <div class="post-header hover-target">
                                <img src="${authorAvatar}" class="post-avatar ${effectAvatarClass} ${effectFrameClass}" onclick="viewProfile('${post.emailKey}')">
                                <div class="post-info">
                                    <h4 onclick="viewProfile('${post.emailKey}')">
                                        <span class="name-level-${authorTier} ${effectNameClass}">${formatText(post.author)}</span> 
                                        ${levelHTML} ${shopTagsHTML} ${moodHTML} ${badgesHTML} ${musicHTML}
                                    </h4>
                                    <span style="display:block;">${post.time}${editedText}</span>
                                </div>
                            </div>
                            <div class="post-content">${formatText(post.content)}</div>
                            ${imageHTML}
                            <div class="post-actions">
                                <button class="action-btn ${activeClass}" onclick="reactPost('${post.id}', '${myReact ? '' : '❤️'}')">
                                    ${displayIcon} ${reactCount > 0 ? reactCount : ''} Thích
                                    <div class="reaction-popup">
                                        <span onclick="event.stopPropagation(); reactPost('${post.id}', '👍')">👍</span>
                                        <span onclick="event.stopPropagation(); reactPost('${post.id}', '❤️')">❤️</span>
                                        <span onclick="event.stopPropagation(); reactPost('${post.id}', '😂')">😂</span>
                                        <span onclick="event.stopPropagation(); reactPost('${post.id}', '😮')">😮</span>
                                        <span onclick="event.stopPropagation(); reactPost('${post.id}', '😢')">😢</span>
                                    </div>
                                </button>
                                <button class="action-btn hover-target" onclick="document.getElementById('input-${post.id}').focus()">💬 Bình luận (${commentsArray.length})</button>
                            </div>
                            <div class="comment-section">
                                ${viewMoreHTML}
                                <div id="comment-list-${post.id}">${commentsHTML}</div>
                                <div class="add-comment-box">
                                    <input type="text" id="input-${post.id}" class="comment-input hover-target" placeholder="Viết bình luận..." onkeypress="if(event.key==='Enter') addComment('${post.id}')">
                                    <button class="btn-comment hover-target" onclick="addComment('${post.id}')">Gửi</button>
                                </div>
                                </div>
                            </div>`;
                    postsArea.insertAdjacentHTML('beforeend', postHTML);
                    
                    if (effectAvatarClass === 'effect-avatar-galaxy') {
                        const postAvatarEl = document.querySelector(`#post-${post.id} .post-avatar`);
                        if (postAvatarEl) initGalaxyEffect(postAvatarEl);
                    }
                });
            });
        }

        async function editPost(postId) {
            const snap = await db.ref(`posts/${postId}`).once('value');
            const post = snap.val();
            if (!post) return;
            
            const { value: text } = await Swal.fire({
                title: 'Chỉnh sửa bài viết',
                input: 'textarea',
                inputValue: post.content, // Form chỉnh sửa giữ nguyên text thô
                showCancelButton: true,
                confirmButtonColor: '#4ecdc4',
                confirmButtonText: 'Cập nhật',
                cancelButtonText: 'Hủy'
            });
            
            if (text !== undefined && text.trim() !== "") {
                await db.ref(`posts/${postId}`).update({ content: text.trim(), edited: true });
                Swal.fire({ title: 'Thành công', text: 'Bài viết đã được cập nhật', icon: 'success', timer: 1500, showConfirmButton: false });
            }
        }

        async function reactPost(postId, reactionType) {
            const reactRef = db.ref(`posts/${postId}/reactions/${currentUser.emailKey}`);
            if (!reactionType) { 
                reactRef.remove(); 
            } else { 
                reactRef.set(reactionType); 
                bubblePopSound.currentTime = 0; 
                bubblePopSound.play().catch(()=>{}); 
                
                const postSnap = await db.ref(`posts/${postId}`).once('value');
                const post = postSnap.val();
                if (post && post.emailKey !== currentUser.emailKey) {
                    db.ref(`users/${post.emailKey}/notifications/${postId}_${currentUser.emailKey}_react`).set({
                        type: 'reaction', fromName: currentUser.name, postId: postId, reaction: reactionType, time: new Date().toLocaleString('vi-VN'), isRead: false
                    });
                }
            }
        }

        // XEM TRƯỚC ẢNH
        function previewPostImage(event) {
            const preview = document.getElementById('post-image-preview');
            const file = event.target.files[0];
            if (file) {
                preview.src = URL.createObjectURL(file);
                preview.style.display = 'block';
            } else {
                preview.src = '';
                preview.style.display = 'none';
            }
        }

        function compressImage(file, maxWidth = 1000, maxHeight = 1000, quality = 0.8) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = event => {
                    const img = new Image();
                    img.src = event.target.result;
                    img.onload = () => {
                        let width = img.width, height = img.height;
                        if (width > maxWidth) { height = Math.round((height *= maxWidth / width)); width = maxWidth; }
                        if (height > maxHeight) { width = Math.round((width *= maxHeight / height)); height = maxHeight; }
                        const canvas = document.createElement('canvas');
                        canvas.width = width; canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        canvas.toBlob(blob => { resolve(new File([blob], file.name, { type: file.type })); }, file.type, quality);
                    };
                };
            });
        }

        async function createNewPost() {
            const content = document.getElementById('new-post-content').value.trim();
            const imageFile = document.getElementById('post-image').files[0];
            const btn = document.getElementById('btn-submit');
            
            if (!content && !imageFile) return Swal.fire("Ê!", "Bạn phải nhập chữ hoặc chọn ảnh chứ!", "warning");
            btn.disabled = true; btn.innerHTML = "Đang đăng...";
            let imageUrl = "";

            try {
                if (imageFile) {
                    const compressedFile = await compressImage(imageFile, 1200, 1200, 0.7); 
                    const formData = new FormData();
                    formData.append("image", compressedFile);
                    
                    const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
                    const imgData = await imgRes.json();
                    if(imgData.success) { imageUrl = imgData.data.url; } 
                    else { Swal.fire("Lỗi ảnh!", "Không tải được ảnh lên.", "error"); btn.disabled = false; btn.innerHTML = "Đăng bài"; return; }
                }

                await db.ref('posts').push({ author: currentUser.name, emailKey: currentUser.emailKey, content: content, time: new Date().toLocaleString('vi-VN'), image_url: imageUrl, edited: false });
                document.getElementById('new-post-content').value = ""; 
                document.getElementById('post-image').value = ""; 
                document.getElementById('post-image-preview').style.display = 'none';
                document.getElementById('post-image-preview').src = '';
                
                gainXP(10);
                updateStreak(); 
                updateAllUserBadges(); 
            } catch (error) { Swal.fire("Lỗi!", "Không thể lưu bài viết!", "error"); } 
            finally { btn.disabled = false; btn.innerHTML = "Đăng bài"; }
        }

        function deletePost(postId) { 
            Swal.fire({
                title: 'Xóa bài viết?', text: "Bạn không thể hoàn tác hành động này!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ff6b6b', cancelButtonColor: '#ccc', confirmButtonText: 'Xóa'
            }).then((result) => { if (result.isConfirmed) { db.ref(`posts/${postId}`).remove(); } });
        }

        async function addComment(postId) {
            const input = document.getElementById(`input-${postId}`);
            const text = input.value.trim();
            if (!text) return;
            
            db.ref(`posts/${postId}/comments`).push({ 
                author: currentUser.name, 
                emailKey: currentUser.emailKey, 
                text: text, 
                time: new Date().toLocaleString('vi-VN') 
            });
            input.value = ""; 
            
            gainXP(5);
            updateStreak(); 

            const postSnap = await db.ref(`posts/${postId}`).once('value');
            const post = postSnap.val();
            if (post && post.emailKey !== currentUser.emailKey) {
                db.ref(`users/${post.emailKey}/notifications`).push({
                    type: 'comment', fromName: currentUser.name, postId: postId, time: new Date().toLocaleString('vi-VN'), isRead: false
                });
            }
            updateAllUserBadges(); 
        }

        // === 7. CHAT NHÓM ===
        function toggleChat() {
            const chat = document.getElementById('chat-widget');
            const btn = document.getElementById('btn-open-chat');
            if (chat.style.display === 'none' || chat.style.display === '') {
                chat.style.display = 'flex'; btn.style.display = 'none'; 
            } else { chat.style.display = 'none'; btn.style.display = 'flex'; }
        }

        function sendChatMessage() {
            const input = document.getElementById('chat-input');
            const msg = input.value.trim();
            if (!msg) return;
            db.ref('groupChat').push({ senderName: currentUser.name, senderKey: currentUser.emailKey, text: msg, timestamp: Date.now() });
            input.value = "";
        }

        function listenChatMessages() {
            db.ref('groupChat').limitToLast(20).on('value', async snap => {
                const chatBox = document.getElementById('chat-messages');
                chatBox.innerHTML = "";
                const data = snap.val();
                if (!data) return;

                const usersSnap = await db.ref('users').once('value');
                const usersData = usersSnap.val() || {};

                Object.values(data).forEach(m => {
                    const isMe = m.senderKey === currentUser.emailKey;
                    
                    const senderData = usersData[m.senderKey] || {};
                    const avatarUrl = getAvatarUrl(m.senderName, senderData.customAvatar);
                    const isOnline = senderData.online;
                    const dotHTML = isOnline ? '<div class="online-dot chat-avatar-dot"></div>' : '';
                    
                    const chatEffects = getUserEffects(senderData);

                    const rowDiv = document.createElement('div');
                    rowDiv.className = `chat-row ${isMe ? 'me' : ''}`;
                    
                    const avatarDiv = document.createElement('div');
                    avatarDiv.style.position = 'relative';
                    avatarDiv.innerHTML = `<img src="${avatarUrl}" class="chat-avatar-img hover-target ${chatEffects.avatarEff} ${chatEffects.frameEff}" title="${formatText(m.senderName)}" onclick="viewProfile('${m.senderKey}')">${dotHTML}`;
                    
                    const msgContentDiv = document.createElement('div');
                    if(!isMe) {
                        const nameLabel = document.createElement('div');
                        nameLabel.className = 'chat-name-label';
                        let chatTier = getLevelTier(senderData.level);
                        nameLabel.innerHTML = `<span class="name-level-${chatTier} ${chatEffects.nameEff}">${formatText(m.senderName)}</span>`;
                        msgContentDiv.appendChild(nameLabel);
                    }
                    
                    const bubbleDiv = document.createElement('div');
                    bubbleDiv.className = `chat-msg ${isMe ? 'msg-me' : 'msg-others'} hover-target`;
                    bubbleDiv.innerHTML = formatText(m.text);
                    bubbleDiv.title = new Date(m.timestamp).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});

                    msgContentDiv.appendChild(bubbleDiv);

                    rowDiv.appendChild(avatarDiv);
                    rowDiv.appendChild(msgContentDiv);

                    chatBox.appendChild(rowDiv);
                });
                chatBox.scrollTop = chatBox.scrollHeight;
            });
        }

        // === CỬA HÀNG (STORE) - CHỈ BÁN PREMIUM, KHÔNG BÁN LEVEL EFFECTS ===
        const SHOP_ITEMS = [
            // Khung viền
            { id: 'frame_fire', type: 'effect', name: 'Khung Lửa', icon: '🔥', price: 1500, cssClass: 'effect-frame-fire', desc: 'Khung viền ngọn lửa cháy rực rỡ' },
            { id: 'frame_ice', type: 'effect', name: 'Khung Băng', icon: '❄️', price: 1500, cssClass: 'effect-frame-ice', desc: 'Khung viền băng giá lấp lánh' },
            { id: 'frame_thunder', type: 'effect', name: 'Khung Sấm', icon: '⚡', price: 2000, cssClass: 'effect-frame-thunder', desc: 'Khung viền sấm sét rực cháy' },
            { id: 'frame_rainbow', type: 'effect', name: 'Khung Cầu Vồng', icon: '🌈', price: 2500, cssClass: 'effect-frame-rainbow', desc: 'Khung viền cầu vồng xoay chuyển' },
            { id: 'frame_angel', type: 'effect', name: 'Khung Thiên Thần', icon: '👼', price: 2500, cssClass: 'effect-frame-angel', desc: 'Khung viền ánh sáng thiên thần' },
            { id: 'frame_neon', type: 'effect', name: 'Khung Neon', icon: '💜', price: 2000, cssClass: 'effect-frame-neon', desc: 'Khung viền neon tím lấp lánh' },
            { id: 'frame_golden', type: 'effect', name: 'Khung Vàng', icon: '💫', price: 1800, cssClass: 'effect-frame-golden', desc: 'Khung viền vàng hoàng kim' },
            { id: 'frame_purple', type: 'effect', name: 'Khung Tím', icon: '💎', price: 1800, cssClass: 'effect-frame-purple', desc: 'Khung viền tím huyền bí' },
            { id: 'frame_nature', type: 'effect', name: 'Khung Thiên Nhiên', icon: '🌿', price: 1500, cssClass: 'effect-frame-nature', desc: 'Khung viền xanh tự nhiên' },
            { id: 'frame_ocean', type: 'effect', name: 'Khung Đại Dương', icon: '🌊', price: 1500, cssClass: 'effect-frame-ocean', desc: 'Khung viền đại dương bao la' },
            // Tag
            { id: 'tag_pro', type: 'tag', name: 'Tag PRO', icon: '🔷', price: 300, tagClass: 'tag-pro', desc: 'Hiển thị tag PRO bên cạnh tên' },
            { id: 'tag_vip', type: 'tag', name: 'Tag VIP', icon: '🔻', price: 500, tagClass: 'tag-vip', desc: 'Tag VIP đặc biệt' },
            { id: 'tag_legend', type: 'tag', name: 'Tag Huyền Thoại', icon: '🏆', price: 1000, tagClass: 'tag-legend', desc: 'Tag Huyền Thoại siêu sang chảnh' },
            { id: 'tag_founder', type: 'tag', name: 'Tag Founder', icon: '🎪', price: 2000, tagClass: 'tag-founder', desc: 'Tag Founder - Người sáng lập' },
            { id: 'tag_god', type: 'tag', name: 'Tag GOD Mode', icon: '💠', price: 5000, tagClass: 'tag-god', desc: 'Tag GOD siêu cấp vũ trụ' }
        ];

        function openShop() {
            Swal.fire({
                title: '🛒 Cửa Hàng',
                html: '<p style="color:#888;">Đang tải...</p>',
                showConfirmButton: false,
                showCloseButton: true,
                width: '600px',
                customClass: { popup: 'shop-popup' }
            });
            renderShopItems();
        }

        async function renderShopItems() {
            const snap = await db.ref('users/' + currentUser.emailKey).once('value');
            const u = snap.val();
            const userXP = u.xp || 0;
            const ownedEffects = u.ownedEffects || [];
            const ownedTags = u.ownedTags || [];

            const effectItems = SHOP_ITEMS.filter(i => i.type === 'effect');
            const tagItems = SHOP_ITEMS.filter(i => i.type === 'tag');

            let html = `<div style="text-align:left; max-height:75vh; overflow-y:auto; padding-right:5px;">
                <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 20px; border-radius: 16px; margin-bottom: 20px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <div style="font-size: 2.5rem; margin-bottom: 5px;">🛒</div>
                    <b style="font-size:1.3rem; background: linear-gradient(90deg, #f1c40f, #f39c12); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">CỬA HÀNG PREMIUM</b>
                    <div style="background: rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 20px; margin-top: 12px; display: inline-block;">
                        <span style="font-size: 1.1rem;">💰</span> <b style="font-size:1.2rem; color: #f1c40f;">${userXP.toLocaleString()}</b> <span style="opacity: 0.8;">XP</span>
                    </div>
                </div>`;

            // Effects Section (Khung Viền)
            html += `<h4 style="color: #e74c3c; margin: 20px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #e74c3c; font-size: 1rem;">✨ Khung Viền</h4>`;
            html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px;">`;
            
            effectItems.forEach(item => {
                const isOwned = ownedEffects.includes(item.id);
                const canAfford = userXP >= item.price;
                const isDisabled = isOwned || !canAfford;
                
                let cardBg = isOwned ? 'linear-gradient(135deg, #1e3a2f, #143d2e)' : (canAfford ? 'linear-gradient(135deg, #2d2d44, #1a1a2e)' : 'linear-gradient(135deg, #2a2a2a, #1f1f1f)');
                let borderColor = isOwned ? '#27ae60' : (canAfford ? '#e74c3c' : '#444');
                let btnBg = isOwned ? '#27ae60' : (canAfford ? 'linear-gradient(135deg, #e74c3c, #c0392b)' : '#555');
                
                html += `<div style="background: ${cardBg}; border: 2px solid ${borderColor}; border-radius: 16px; padding: 15px 10px; text-align: center; transition: all 0.3s ease; ${!isDisabled ? 'cursor: pointer;' : ''}" ${!isDisabled ? `onclick="buyItem('${item.id}')"` : ''}>
                    <div style="font-size: 2rem; margin-bottom: 8px; ${isOwned ? 'filter: grayscale(0);' : ''}">${item.icon}</div>
                    <div style="font-weight: bold; font-size: 0.85rem; color: #fff; margin-bottom: 4px; line-height: 1.3;">${item.name}</div>
                    <div style="font-size: 0.7rem; color: #aaa; margin-bottom: 10px; min-height: 28px;">${item.desc}</div>
                    <div style="font-weight: bold; color: #f1c40f; font-size: 0.9rem; margin-bottom: 10px;">${item.price.toLocaleString()} XP</div>
                    ${isOwned 
                        ? `<div style="background: #27ae60; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">✓ Đã sở hữu</div>`
                        : `<div style="background: ${btnBg}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; ${!canAfford ? 'opacity: 0.5;' : ''}">${canAfford ? '🛒 Mua' : '❌ Thiếu XP'}</div>`
                    }
                </div>`;
            });
            html += `</div>`;

            // Tags Section
            html += `<h4 style="color: #3498db; margin: 20px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #3498db; font-size: 1rem;">🏷️ Tag Đặc Biệt</h4>`;
            html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;">`;
            
            tagItems.forEach(item => {
                const isOwned = ownedTags.includes(item.id);
                const canAfford = userXP >= item.price;
                const isDisabled = isOwned || !canAfford;
                
                let cardBg = isOwned ? 'linear-gradient(135deg, #1e3a2f, #143d2e)' : (canAfford ? 'linear-gradient(135deg, #2d2d44, #1a1a2e)' : 'linear-gradient(135deg, #2a2a2a, #1f1f1f)');
                let borderColor = isOwned ? '#27ae60' : (canAfford ? '#3498db' : '#444');
                let btnBg = isOwned ? '#27ae60' : (canAfford ? 'linear-gradient(135deg, #3498db, #2980b9)' : '#555');
                
                html += `<div style="background: ${cardBg}; border: 2px solid ${borderColor}; border-radius: 16px; padding: 15px 10px; text-align: center; transition: all 0.3s ease; ${!isDisabled ? 'cursor: pointer;' : ''}" ${!isDisabled ? `onclick="buyItem('${item.id}')"` : ''}>
                    <div style="font-size: 2rem; margin-bottom: 8px;">${item.icon}</div>
                    <div style="font-weight: bold; font-size: 0.85rem; color: #fff; margin-bottom: 4px; line-height: 1.3;">${item.name.replace('Tag ', '')}</div>
                    <div style="font-size: 0.7rem; color: #aaa; margin-bottom: 10px;">${item.desc}</div>
                    <div style="font-weight: bold; color: #f1c40f; font-size: 0.9rem; margin-bottom: 10px;">${item.price.toLocaleString()} XP</div>
                    ${isOwned 
                        ? `<div style="background: #27ae60; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">✓ Đã sở hữu</div>`
                        : `<div style="background: ${btnBg}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; ${!canAfford ? 'opacity: 0.5;' : ''}">${canAfford ? '🛒 Mua' : '❌ Thiếu XP'}</div>`
                    }
                </div>`;
            });
            html += `</div></div>`;
            
            const shopSwal = Swal.getPopup();
            if(shopSwal) {
                shopSwal.querySelector('.swal2-html-container').innerHTML = html;
            }
        }

        async function buyItem(itemId) {
            const item = SHOP_ITEMS.find(i => i.id === itemId);
            if(!item) return;

            const snap = await db.ref('users/' + currentUser.emailKey).once('value');
            const u = snap.val();
            const userXP = u.xp || 0;

            if(userXP < item.price) {
                Swal.fire('❌ Không đủ XP', `Bạn cần ${item.price} XP nhưng chỉ có ${userXP} XP`, 'error');
                return;
            }

            const isOwned = (item.type === 'effect' && (u.ownedEffects || []).includes(item.id)) || 
                           (item.type === 'tag' && (u.ownedTags || []).includes(item.id));

            if(isOwned) {
                Swal.fire('ℹ️ Thông báo', 'Bạn đã sở hữu item này rồi!', 'info');
                return;
            }

            const result = await Swal.fire({
                title: 'Xác nhận mua?',
                html: `<div style="text-align:center; padding: 10px;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">${item.icon}</div>
                    <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 5px;">${item.name}</div>
                    <div style="color: #f39c12; font-weight: bold; font-size: 1.2rem;">${item.price.toLocaleString()} XP</div>
                </div>`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#27ae60',
                cancelButtonColor: '#666',
                confirmButtonText: '✓ Mua',
                cancelButtonText: 'Hủy'
            });

            if(result.isConfirmed) {
                const updates = { xp: userXP - item.price };
                
                if(item.type === 'effect') {
                    updates.ownedEffects = [...(u.ownedEffects || []), item.id];
                } else {
                    updates.ownedTags = [...(u.ownedTags || []), item.id];
                }

                await db.ref('users/' + currentUser.emailKey).update(updates);
                
                Swal.fire('🎉 Mua thành công!', `Bạn đã sở hữu ${item.name}`, 'success');
                renderShopItems();
            }
        }

        // === 8. QUẢN LÝ HUY HIỆU & THÀNH TỰU ===
        
        // === GALAXY AVATAR EFFECT - DISABLED (causes performance issues) ===
        const GalaxyEffectManager = {
            init() {},
            attachToAvatar() {},
            cleanup() {}
        };
        
        function initGalaxyEffect(avatarEl) {
            // Disabled - galaxy effect removed
        }
        
        async function updateAllUserBadges() {
            try {
                const postsSnap = await db.ref('posts').once('value');
                const usersSnap = await db.ref('users').once('value');
                const posts = postsSnap.val() || {};
                const users = usersSnap.val() || {};
                
                let stats = {};
                Object.values(posts).forEach(post => {
                    const uKey = post.emailKey;
                    if (!stats[uKey]) stats[uKey] = { postCount: 0, commentCount: 0 };
                    stats[uKey].postCount++;
                    if (post.comments) stats[uKey].commentCount += Object.keys(post.comments).length;
                });
                
                for (let uKey in users) {
                    let userBadges = users[uKey].badges || [];
                    
                    const userStats = stats[uKey] || { postCount: 0, commentCount: 0 };
                    
                    // QUÉT VÀ THÊM THÀNH TỰU MỚI NẾU ĐẠT ĐIỀU KIỆN
                    ACHIEVEMENTS.forEach(ach => {
                        if (ach.condition(users[uKey], userStats)) {
                            if (!userBadges.find(b => b.name === ach.name)) {
                                userBadges.push({ name: ach.name, icon: ach.icon, class: ach.class, isManual: false });
                            }
                        }
                    });
                    
                    if (users[uKey].role === 'admin' && !userBadges.find(b => b.name === "Admin")) { 
                        userBadges.push({ name: "Admin", icon: "⚡", class: "badge-gold", isManual: false }); 
                    }
                    
                    await db.ref(`users/${uKey}/badges`).set(userBadges);
                }
            } catch (e) { console.error("Lỗi cập nhật danh hiệu:", e); }
        }

        async function awardBadgePrompt(targetKey, targetName) {
            const { value: formValues } = await Swal.fire({
                title: `Trao huy hiệu cho ${formatText(targetName)}`,
                html: '<input id="swal-badge-name" class="swal2-input" placeholder="Tên huy hiệu (VD: Trùm trà sữa)">' +
                    '<input id="swal-badge-icon" class="swal2-input" placeholder="Icon (VD: 💎)">' +
                    '<select id="swal-badge-class" class="swal2-input"><option value="badge-gold">Vàng</option><option value="badge-purple">Tím</option><option value="badge-green">Xanh lá</option><option value="badge-silver">Bạc</option><option value="badge-blue">Xanh dương</option><option value="badge-red">Đỏ</option><option value="badge-cyan">Cyan</option><option value="badge-orange">Cam</option><option value="badge-rainbow">Cầu vồng</option></select>',
                focusConfirm: false, showCancelButton: true,
                preConfirm: () => { return { name: document.getElementById('swal-badge-name').value, icon: document.getElementById('swal-badge-icon').value, class: document.getElementById('swal-badge-class').value, isManual: true } }
            });
            if (formValues && formValues.name) {
                const userRef = db.ref(`users/${targetKey}/badges`);
                const snap = await userRef.once('value');
                let badges = snap.val() || [];
                badges.push(formValues);
                await userRef.set(badges);
                Swal.fire('Thành công!', `Đã trao danh hiệu ${formValues.icon} cho ${formatText(targetName)}`, 'success');
                viewProfile(targetKey); 
            }
        }

        async function deleteBadge(targetKey, index, badgeName) {
            const result = await Swal.fire({ title: 'Thu hồi huy hiệu?', text: `Gỡ bỏ "${badgeName}"?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ff4757', confirmButtonText: 'Đúng, thu hồi!' });
            if (result.isConfirmed) {
                try {
                    const userRef = db.ref(`users/${targetKey}/badges`);
                    const snap = await userRef.once('value');
                    let badges = snap.val() || [];
                    badges.splice(index, 1);
                    await userRef.set(badges);
                    Swal.fire('Đã thu hồi!', 'Huy hiệu đã được gỡ bỏ.', 'success');
                    viewProfile(targetKey); 
                } catch (error) { Swal.fire('Lỗi!', 'Không thể thu hồi huy hiệu lúc này.', 'error'); }
            }
        }

        function listenDeadlines() {
            db.ref('deadlines').orderByChild('timestamp').on('value', snap => {
                const list = document.getElementById('deadline-list');
                list.innerHTML = "";
                const data = snap.val();
                const isAdmin = currentUser.role === 'admin';
                document.getElementById('btn-add-deadline').style.display = isAdmin ? 'block' : 'none';
                
                const eventsList = [];
                if(!data) { 
                    list.innerHTML = "<li><span style='color:var(--text-sub);'>Chưa có thông báo hoặc sự kiện nào sắp tới.</span></li>"; 
                } else {
                    Object.keys(data).forEach(key => {
                        const d = data[key];
                        eventsList.push(d);
                        const delBtn = isAdmin ? `<button class="hover-target" onclick="deleteDeadline('${key}')" style="background:none; border:none; color:#ff4757; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>` : '';
                        list.innerHTML += `<li class="deadline-item hover-target"><span class="deadline-date">${d.date}</span><span class="deadline-title">${formatText(d.title)}</span>${delBtn}</li>`;
                    });
                }
                
                // Vẽ Lịch
                renderMiniCalendar(eventsList);
            });
        }

        async function addDeadline() {
            const { value: formValues } = await Swal.fire({
                title: 'Thêm Sự kiện / Deadline',
                html: '<input id="swal-dl-title" class="swal2-input" placeholder="Tên sự kiện">' + '<input type="date" id="swal-dl-date" class="swal2-input">',
                focusConfirm: false, showCancelButton: true, confirmButtonColor: '#4ecdc4',
                preConfirm: () => { 
                    return { 
                        title: document.getElementById('swal-dl-title').value, 
                        date: document.getElementById('swal-dl-date').value, 
                        timestamp: new Date(document.getElementById('swal-dl-date').value).getTime() || Date.now() 
                    } 
                }
            });
            if(formValues && formValues.title && formValues.date) {
                let formattedDate = formValues.date;
                if(formValues.date.includes('-')) {
                    const [y, m, d] = formValues.date.split('-');
                    formattedDate = `${d}/${m}/${y}`;
                }
                await db.ref('deadlines').push({ title: formValues.title, date: formattedDate, timestamp: formValues.timestamp });
                Swal.fire({title: 'Thành công', icon: 'success', timer: 1500, showConfirmButton: false});
            }
        }

        function deleteDeadline(key) {
            Swal.fire({ title: 'Xóa sự kiện này?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ff6b6b', confirmButtonText: 'Xóa' }).then((result) => { if (result.isConfirmed) { db.ref(`deadlines/${key}`).remove(); } });
        }

        // === EVENT DELEGATION FOR POSTS (Performance Optimization) ===
        document.addEventListener('click', PerfUtils.throttle((e) => {
            const target = e.target.closest('[data-action]');
            if (!target) {
                // Handle lightbox for images
                const img = e.target.closest('.post-image');
                if (img && img.src) {
                    openLightbox(img.src);
                }
                return;
            }
            
            const action = target.dataset.action;
            const postId = target.dataset.post;
            
            switch(action) {
                case 'delete':
                    deletePost(postId);
                    break;
                case 'edit':
                    editPost(postId);
                    break;
                case 'viewProfile':
                    const email = target.dataset.email;
                    if (email) viewProfile(email);
                    break;
                case 'react':
                    const react = target.dataset.react;
                    reactPost(postId, react);
                    break;
                case 'focusComment':
                    const inputEl = document.getElementById(`input-${postId}`);
                    if (inputEl) inputEl.focus();
                    break;
                case 'comment':
                    addComment(postId);
                    break;
            }
        }, 150), { passive: true });

        // Enter key for comments
        document.addEventListener('keypress', PerfUtils.throttle((e) => {
            if (e.key === 'Enter') {
                const input = e.target;
                if (input.classList.contains('comment-input')) {
                    const postId = input.id.replace('input-', '');
                    addComment(postId);
                }
            }
        }, 100), { passive: true });

        // Throttled chat listener
        let chatLastUpdate = 0;
        const CHAT_UPDATE_DELAY = 300;

        function listenChatMessages() {
            db.ref('chat').limitToLast(50).on('value', (snapshot) => {
                const now = Date.now();
                if (now - chatLastUpdate < CHAT_UPDATE_DELAY) return;
                chatLastUpdate = now;

                const chatList = document.getElementById('chat-list');
                if (!chatList) return;
                
                const data = snapshot.val();
                if (!data) return;
                
                const html = Object.keys(data).map(key => {
                    const msg = data[key];
                    const isMe = msg.emailKey === currentUser.emailKey;
                    return `<div class="chat-message ${isMe ? 'chat-message-me' : ''}">
                        <b class="${isMe ? '' : 'name-level-1'}">${formatText(msg.name)}:</b> ${formatText(msg.text)}
                    </div>`;
                }).join('');
                
                chatList.innerHTML = html;
                chatList.scrollTop = chatList.scrollHeight;
            });
        }

        // Throttled deadlines listener
        let deadlinesLastUpdate = 0;
        const DEADLINE_UPDATE_DELAY = 500;

        function listenDeadlines() {
            db.ref('deadlines').orderByChild('timestamp').on('value', (snapshot) => {
                const now = Date.now();
                if (now - deadlinesLastUpdate < DEADLINE_UPDATE_DELAY) return;
                deadlinesLastUpdate = now;

                const list = document.getElementById('deadline-list');
                if (!list) return;
                
                list.innerHTML = "";
                const data = snapshot.val();
                const isAdmin = currentUser.role === 'admin';
                document.getElementById('btn-add-deadline').style.display = isAdmin ? 'block' : 'none';
                
                const eventsList = [];
                if(!data) { 
                    list.innerHTML = "<li><span style='color:var(--text-sub);'>Chưa có thông báo hoặc sự kiện nào sắp tới.</span></li>"; 
                } else {
                    Object.keys(data).forEach(key => {
                        const d = data[key];
                        eventsList.push(d);
                        const delBtn = isAdmin ? `<button class="hover-target" data-action="deleteDeadline" data-key="${key}" style="background:none; border:none; color:#ff4757; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>` : '';
                        list.innerHTML += `<li class="deadline-item hover-target"><span class="deadline-date">${d.date}</span><span class="deadline-title">${formatText(d.title)}</span>${delBtn}</li>`;
                    });
                }
                
                renderMiniCalendar(eventsList);
            });
        }

        // Event delegation for deadline delete
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="deleteDeadline"]');
            if (btn) {
                deleteDeadline(btn.dataset.key);
            }
        }, { passive: true });

        let newWorker;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        // Khi bản mới đã tải ngầm xong
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateNotification();
        }
      });
    });
  });
}

function showUpdateNotification() {
  // Tạo UI thông báo cập nhật
  const toast = document.createElement('div');
  toast.innerHTML = `
    <div style="position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: #333; color: #fff; padding: 12px 20px; border-radius: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 10000; display: flex; align-items: center; gap: 15px; font-size: 0.9rem;">
      <span>Có bản cập nhật mới! 🚀</span>
      <button onclick="applyUpdate()" style="background: #4ecdc4; color: white; border: none; padding: 5px 15px; border-radius: 15px; cursor: pointer; font-weight: bold;">Làm mới</button>
    </div>
  `;
  document.body.appendChild(toast);
}

function applyUpdate() {
  if (newWorker) {
    // Ra lệnh cho Service Worker mới kích hoạt ngay lập tức
    newWorker.postMessage('SKIP_WAITING');
  }
}

// Lắng nghe khi Service Worker mới đã nắm quyền kiểm soát thì tự động reload trang
let refreshing;
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (refreshing) return;
  window.location.reload();
  refreshing = true;
});