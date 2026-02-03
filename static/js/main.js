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

        const manualEmail = document.getElementById('targetEmail').value.trim();
        if (manualEmail) {
            formData.append('target_email', manualEmail);
        }

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

                let statusText = "Email: Enviado ✅";
                let statusColor = "#10b981";

                if (data.email_status === 'Missing Email') {
                    statusText = "Aviso: No se detectó email en el texto (revisá el CV)";
                    statusColor = "#f59e0b";
                } else if (data.email_status === 'Failed') {
                    statusText = "Error: Falló el envío del mail (SMTP)";
                    statusColor = "#ef4444";
                }

                emailStatus.textContent = statusText;
                emailStatus.style.background = statusColor;
                results.hidden = false;
                loadHistory();

                // --- NEW PREVIEW & EDITOR LOGIC ---
                currentSessionId = data.session_id;
                populateEditor(data.cv_data);
                showPreview(data.session_id, data.pdfs[0]); // Show normal PDF by default
                document.getElementById('preview-editor-section').hidden = false;

                window.scrollTo({ top: results.offsetTop - 50, behavior: 'smooth' });
                // clearInputs(); // Don't clear yet so they can see what they uploaded if needed?
                // Actually, let's just clear for a clean state in the generator part.
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

    let currentSessionId = null;

    function showPreview(sessionId, filename) {
        const previewUrl = `/serve_pdf/${sessionId}/${filename}?t=${Date.now()}`;
        document.getElementById('pdfPreview').src = previewUrl;
        document.getElementById('previewFilename').textContent = filename;
    }

    function populateEditor(cv) {
        document.getElementById('edit-nombre').value = cv.nombre || '';
        document.getElementById('edit-email').value = cv.email || '';
        document.getElementById('edit-perfil').value = cv.perfil || '';

        const expContainer = document.getElementById('exp-container');
        expContainer.innerHTML = '';
        if (cv.experiencia) {
            cv.experiencia.forEach(exp => addExpField(exp));
        }

        const eduContainer = document.getElementById('edu-container');
        eduContainer.innerHTML = '';
        if (cv.educacion) {
            cv.educacion.forEach(edu => addEduField(edu));
        }
    }

    window.addExpField = function (data = {}) {
        const div = document.createElement('div');
        div.className = 'exp-item';
        div.innerHTML = `
            <button class="btn-remove-item" onclick="this.parentElement.remove()">×</button>
            <div class="field-item"><label>Empresa</label><input type="text" class="exp-empresa" value="${data.empresa || ''}"></div>
            <div class="field-item"><label>Puesto</label><input type="text" class="exp-puesto" value="${data.puesto || ''}"></div>
            <div class="field-item"><label>Fechas</label><input type="text" class="exp-fechas" value="${data.fechas || ''}"></div>
            <div class="field-item"><label>Ubicación</label><input type="text" class="exp-ubicacion" value="${data.ubicacion || ''}"></div>
            <div class="field-item"><label>Logros (sep. por punto)</label>
            <textarea class="exp-logros small-text">${(data.logros || []).join('. ')}</textarea></div>
        `;
        document.getElementById('exp-container').appendChild(div);
    };

    window.addEduField = function (data = {}) {
        const div = document.createElement('div');
        div.className = 'edu-item';
        div.innerHTML = `
            <button class="btn-remove-item" onclick="this.parentElement.remove()">×</button>
            <div class="field-item"><label>Institución</label><input type="text" class="edu-institucion" value="${data.institucion || ''}"></div>
            <div class="field-item"><label>Título</label><input type="text" class="edu-titulo" value="${data.titulo || ''}"></div>
            <div class="field-item"><label>Fechas</label><input type="text" class="edu-fechas" value="${data.fechas || ''}"></div>
            <div class="field-item"><label>Ubicación</label><input type="text" class="edu-ubicacion" value="${data.ubicacion || ''}"></div>
        `;
        document.getElementById('edu-container').appendChild(div);
    };

    const regenerateBtn = document.getElementById('regenerateBtn');
    regenerateBtn.addEventListener('click', async () => {
        if (!currentSessionId) return;

        const regBtnText = document.getElementById('regBtnText');
        const regLoader = document.getElementById('regLoader');

        regenerateBtn.disabled = true;
        regBtnText.textContent = 'Actualizando...';
        regLoader.classList.remove('hidden');

        // Collect data from editor
        const updatedData = {
            nombre: document.getElementById('edit-nombre').value,
            email: document.getElementById('edit-email').value,
            perfil: document.getElementById('edit-perfil').value,
            experiencia: [],
            educacion: []
        };

        document.querySelectorAll('.exp-item').forEach(item => {
            updatedData.experiencia.push({
                empresa: item.querySelector('.exp-empresa').value,
                puesto: item.querySelector('.exp-puesto').value,
                fechas: item.querySelector('.exp-fechas').value,
                ubicacion: item.querySelector('.exp-ubicacion').value,
                logros: item.querySelector('.exp-logros').value.split('.').map(s => s.trim()).filter(s => s)
            });
        });

        document.querySelectorAll('.edu-item').forEach(item => {
            updatedData.educacion.push({
                institucion: item.querySelector('.edu-institucion').value,
                titulo: item.querySelector('.edu-titulo').value,
                fechas: item.querySelector('.edu-fechas').value,
                ubicacion: item.querySelector('.edu-ubicacion').value
            });
        });

        try {
            const response = await fetch('/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    cv_data: updatedData
                })
            });

            const res = await response.json();
            if (response.ok) {
                // Update preview with normal PDF
                showPreview(currentSessionId, res.pdfs[0]);
                emailStatus.textContent = "¡Actualizado y Reenviado! ✅";
                emailStatus.style.background = "#10b981";
                loadHistory();
                alert("CV actualizado y reenviado con éxito.");
            } else {
                alert('Error al regenerar: ' + res.error);
            }
        } catch (err) {
            console.error(err);
            alert('Error al conectar con el servidor.');
        } finally {
            regenerateBtn.disabled = false;
            regBtnText.textContent = 'Actualizar y Reenviar';
            regLoader.classList.add('hidden');
        }
    });

    function clearInputs() {
        pastedText.value = '';
        fileInput.value = '';
        photoInput.value = '';
        document.getElementById('targetEmail').value = '';
        fileList.innerHTML = '';
        selectedFiles = [];
        profilePhotoBlob = null;
        photoPreview.classList.add('preview-hidden');
        photoPrompt.classList.remove('hidden');
    }
});
