document.addEventListener('DOMContentLoaded', () => {
    const photoDropZone = document.getElementById('photoDropZone');
    const photoInput = document.getElementById('photoInput');
    const photoPreview = document.getElementById('photoPreview');
    const previewImg = document.getElementById('previewImg');
    const photoPrompt = document.getElementById('photoPrompt');

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const processBtn = document.getElementById('processBtn');
    const pastedText = document.getElementById('pastedText');
    const results = document.getElementById('results');
    const successMsg = document.getElementById('successMsg');
    const emailStatus = document.getElementById('emailStatus');
    const loader = document.getElementById('loader');

    const successSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3');
    successSound.volume = 1.0;

    const historyBody = document.getElementById('historyBody');

    async function loadHistory() {
        if (!historyBody) return;
        try {
            const resp = await fetch('/history');
            const data = await resp.json();

            historyBody.innerHTML = '';
            data.forEach(entry => {
                const tr = document.createElement('tr');
                let statusClass = 'status-sent';
                if (entry.status === 'Failed') statusClass = 'status-failed';
                if (entry.status === 'Missing Email') statusClass = 'status-missing';

                tr.innerHTML = `
                    <td>${entry.timestamp}</td>
                    <td style="font-weight: 600;">${entry.candidate}</td>
                    <td style="color: var(--text-muted);">${entry.email}</td>
                    <td><span class="status-tag ${statusClass}">${entry.status}</span></td>
                `;
                historyBody.appendChild(tr);
            });
        } catch (e) {
            console.error('Error cargando historial:', e);
        }
    }

    loadHistory();

    let selectedFiles = [];
    let profilePhotoBlob = null;

    // --- Photo Slot (Dedicated) ---
    photoDropZone.addEventListener('click', () => photoInput.click());

    photoDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        photoDropZone.classList.add('active');
    });

    photoDropZone.addEventListener('dragleave', () => {
        photoDropZone.classList.remove('active');
    });

    photoDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        photoDropZone.classList.remove('active');
        if (e.dataTransfer.files.length > 0) {
            handleProfilePhoto(e.dataTransfer.files[0]);
        }
    });

    photoInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleProfilePhoto(e.target.files[0]);
        }
    });

    // CLIPBOARD (Paste) Support
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData)).items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                handleProfilePhoto(blob);
            }
        }
    });

    function handleProfilePhoto(file) {
        if (!file.type.startsWith('image/')) {
            alert('Por favor selecciona una imagen válida.');
            return;
        }
        profilePhotoBlob = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            photoPreview.classList.remove('preview-hidden');
            photoPrompt.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }

    // --- Extra Files ---
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('active');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('active');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    function handleFiles(files) {
        for (let file of files) {
            const fileId = Math.random().toString(36).substring(2, 9);
            selectedFiles.push({ id: fileId, file: file });

            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.id = fileId;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = file.name;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Eliminar archivo';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeFile(fileId);
            };

            item.appendChild(nameSpan);
            item.appendChild(removeBtn);
            fileList.appendChild(item);
        }
    }

    function removeFile(fileId) {
        selectedFiles = selectedFiles.filter(item => item.id !== fileId);
        const element = fileList.querySelector(`[data-id="${fileId}"]`);
        if (element) element.remove();
    }

    // --- Process ---
    processBtn.addEventListener('click', async () => {
        const text = pastedText.value.trim();
        if (selectedFiles.length === 0 && !text) {
            alert('Por favor, ingresá texto o subí archivos.');
            return;
        }

        // UI State
        processBtn.disabled = true;
        const btnText = document.getElementById('btnText');
        btnText.textContent = 'Procesando...';
        loader.classList.remove('hidden');
        results.hidden = true;

        const formData = new FormData();
        formData.append('text', text);

        if (profilePhotoBlob) {
            // Give it a generic name if it's from paste
            const filename = profilePhotoBlob.name || "pasted_image.png";
            formData.append('profile_photo', profilePhotoBlob, filename);
        }

        selectedFiles.forEach(item => {
            formData.append('files', item.file);
        });

        try {
            const response = await fetch('/process', {
                method: 'POST',
                body: formData
            });

            // Leer como texto primero por si no es JSON (ej. error 504 de Vercel)
            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (jsonErr) {
                console.error("No se pudo parsear JSON:", responseText);
                throw new Error(`Error del servidor (${response.status}): ${responseText.substring(0, 150)}...`);
            }

            if (response.ok) {
                successSound.play().catch(e => console.log('Bloqueo de audio por navegador:', e));
                successMsg.textContent = `¡Felicidades! Se procesó el CV de ${data.candidate}.`;
                // ... rest of success logic as before ...
                let statusText = "Email: Enviado ✅";
                let statusColor = "#10b981";

                if (data.email_status === 'Missing Email') {
                    statusText = "Aviso: No se detectó email en el texto (revisá el CV)";
                    statusColor = "#f59e0b";
                } else if (data.email_status === 'Missing Credentials') {
                    statusText = "Error: Faltan llaves en el servidor (Vercel)";
                    statusColor = "#ef4444";
                } else if (data.email_status === 'Failed') {
                    statusText = "Error: Falló el envío del mail (SMTP)";
                    statusColor = "#ef4444";
                }

                emailStatus.textContent = statusText;
                emailStatus.style.background = statusColor;
                results.hidden = false;
                loadHistory(); // Refresh history
                window.scrollTo({ top: results.offsetTop - 50, behavior: 'smooth' });
                clearInputs();

            } else {
                alert('Error: ' + (data.error || 'Ocurrió un problema en el servidor.'));
            }
        } catch (err) {
            console.error(err);
            alert('Error: ' + err.message);
        } finally {
            processBtn.disabled = false;
            btnText.textContent = 'Generar y Enviar CV';
            loader.classList.add('hidden');
        }
    });

    function clearInputs() {
        // Generator
        pastedText.value = '';
        fileInput.value = '';
        photoInput.value = '';
        fileList.innerHTML = '';
        selectedFiles = [];
        profilePhotoBlob = null;
        photoPreview.classList.add('preview-hidden');
        photoPrompt.classList.remove('hidden');
    }
});
