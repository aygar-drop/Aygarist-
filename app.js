// --- Auth and owner-only logic ---
const ownerEmail = "OWNER_EMAIL_HERE"; // <-- Set your email here!

// Page mode detection
const isHome = window.location.pathname.endsWith("index.html") || window.location.pathname === "/" || window.location.pathname === "";
const isGallery = window.location.pathname.endsWith("gallery.html");

// --- Auth controls ---
function showOwnerUI(isOwner) {
    if (isHome) {
        document.getElementById("login-section").style.display = isOwner ? "none" : "";
        document.getElementById("upload-section").style.display = isOwner ? "" : "none";
        document.getElementById("logoutBtn").style.display = isOwner ? "" : "none";
    }
    if (isGallery) {
        document.getElementById("logoutBtnGallery").style.display = isOwner ? "" : "none";
        // Show edit/delete buttons only for owner, handled below in gallery render
    }
}

// --- Auth Event Listeners ---
let currentUser = null;

function handleAuthState(user) {
    currentUser = user;
    const isOwner = !!user && user.email === ownerEmail;
    showOwnerUI(isOwner);
    // For gallery: re-render when auth state changes
    if (isGallery) loadNextBatch(true, isOwner);
}

if (isHome) {
    document.getElementById("loginForm").addEventListener("submit", async e => {
        e.preventDefault();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        try {
            await auth.signInWithEmailAndPassword(email, password);
            document.getElementById("login-error").textContent = "";
        } catch (err) {
            document.getElementById("login-error").textContent = "Login failed: " + (err.message || "unknown error");
        }
    });
    document.getElementById("logoutBtn").addEventListener("click", () => auth.signOut());
}
if (isGallery) {
    document.getElementById("logoutBtnGallery").addEventListener("click", () => auth.signOut());
}

// --- Upload ---
if (isHome) {
    document.getElementById("uploadForm").addEventListener("submit", async e => {
        e.preventDefault();
        document.getElementById("upload-error").textContent = "";
        document.getElementById("upload-success").textContent = "";
        const title = document.getElementById("fileTitle").value.trim();
        const description = document.getElementById("fileDescription").value.trim();
        const file = document.getElementById("fileInput").files[0];
        if (!file) {
            document.getElementById("upload-error").textContent = "No file selected.";
            return;
        }
        const isOwner = !!currentUser && currentUser.email === ownerEmail;
        if (!isOwner) {
            document.getElementById("upload-error").textContent = "Only the owner can upload.";
            return;
        }
        try {
            const fileType = file.type;
            const isImage = fileType.startsWith("image/");
            const kind = isImage ? "sketch" : "blog";
            const fileId = Date.now() + "_" + Math.random().toString(36).substring(2,8);
            const storageRef = storage.ref().child(`uploads/${kind}/${fileId}_${file.name}`);
            await storageRef.put(file);
            const url = await storageRef.getDownloadURL();
            await db.collection("uploads").add({
                kind,
                title,
                description,
                fileName: file.name,
                fileType,
                url,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            document.getElementById("upload-success").textContent = "Upload successful!";
            document.getElementById("uploadForm").reset();
        } catch (err) {
            document.getElementById("upload-error").textContent = "Upload failed: " + (err.message || "unknown error");
        }
    });
}

// --- Gallery Infinite Scroll and Render ---
const BATCH_SIZE = 8; // files per fetch
let lastDoc = null;
let loading = false;
let reachedEnd = false;
let isOwnerInGallery = false;

async function loadNextBatch(reset = false, forceOwner = null) {
    if (!isGallery) return;
    if (loading || reachedEnd) return;
    loading = true;
    document.getElementById("gallery-loader").style.display = "
