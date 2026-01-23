import os
import uuid
import shutil
import mimetypes
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS

from cv_parser import parse_cv_multimodal, upload_to_gemini, extract_text_from_pdf
import google.generativeai as genai
import json
import datetime
from cv_dividers_only import generate_divider, generate_divider_smaller, generate_divider_larger, generate_divider_tiny, create_circular_image_with_border, build_dividers_pdf
from email_sender import send_cvs_email
import glob

# Función stub para mantener compatibilidad si se llama, pero ya no usamos python-docx por peso
def extract_text_from_docx(path):
    print(f"Warning: DOCX extraction disabled for Vercel size limits.")
    return ""

app = Flask(__name__)
CORS(app)

# En Vercel solo se puede escribir en /tmp
UPLOAD_FOLDER = '/tmp/web_uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
HISTORY_FILE = os.path.join(UPLOAD_FOLDER, "history.json")

def log_to_history(name, email, status):
    history = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                history = json.load(f)
        except:
            history = []
    
    new_entry = {
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "candidate": name,
        "email": email,
        "status": status
    }
    history.insert(0, new_entry) # Most recent first
    # Keep only last 50 entries
    history = history[:50]
    
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=4, ensure_ascii=False)

@app.route('/ping')
def ping():
    return jsonify({"status": "pong"})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process():
    session_id = str(uuid.uuid4())
    session_path = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    os.makedirs(session_path)

    try:
        # 1. Handle Text Input
        raw_text = request.form.get('text', '')
        if raw_text:
            text_file_path = os.path.join(session_path, 'pasted_info.txt')
            with open(text_file_path, 'w', encoding='utf-8') as f:
                f.write(raw_text)

        # 2. Handle File Uploads
        files = request.files.getlist('files')
        profile_file = request.files.get('profile_photo')
        
        gemini_inputs = []
        profile_image_path = None

        if raw_text:
            gemini_inputs.append(text_file_path)

        # Explicit Profile Photo
        if profile_file and profile_file.filename != '':
            ext = os.path.splitext(profile_file.filename)[1] or ".png"
            profile_image_path = os.path.join(session_path, f"input_profile{ext}")
            profile_file.save(profile_image_path)
            print(f"[{session_id}] Dedicated profile photo received.")

        for file in files:
            if file.filename == '':
                continue
            
            filename = file.filename
            file_path = os.path.join(session_path, filename)
            file.save(file_path)
            
            mime_type, _ = mimetypes.guess_type(file_path)
            lower_name = filename.lower()
            
            # Handle DOCX specifically
            if lower_name.endswith('.docx'):
                docx_text = extract_text_from_docx(file_path)
                if docx_text:
                    txt_version = file_path + ".txt"
                    with open(txt_version, 'w', encoding='utf-8') as tf:
                        tf.write(docx_text)
                    gemini_inputs.append(txt_version)
                    print(f"[{session_id}] DOCX text extracted and added.")
                continue

            if mime_type and mime_type.startswith('image'):
                # Fallback if no dedicated photo was sent but one file has the keyword
                if not profile_image_path and any(k in lower_name for k in ['foto', 'perfil', 'profile', 'face']):
                    profile_image_path = file_path
                else:
                    gemini_inputs.append(file_path)
            else:
                gemini_inputs.append(file_path)

        if not gemini_inputs and not profile_image_path:
            return jsonify({"error": "No data provided"}), 400

        # 3. Call Automation Engine
        print(f"[{session_id}] Parsing CV data...")
        cv_data = parse_cv_multimodal(gemini_inputs)
        
        # 4. Image Processing
        processed_image_out = None
        if profile_image_path:
            print(f"[{session_id}] Processing profile image...")
            processed_image_out = os.path.join(session_path, "processed_profile.png")
            create_circular_image_with_border(profile_image_path, processed_image_out)

        # 5. PDF Generation
        print(f"[{session_id}] Generating PDFs...")
        output_dir = os.path.join(session_path, "output_cvs")
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        p1 = generate_divider(cv_data, output_dir, processed_image_out)
        p2 = generate_divider_smaller(cv_data, output_dir, processed_image_out)
        p3 = generate_divider_larger(cv_data, output_dir, processed_image_out)
        p4 = generate_divider_tiny(cv_data, output_dir, processed_image_out)
        
        generated_pdfs = [p1, p2, p3, p4]

        # 6. Email Delivery
        gmail_user = os.environ.get("GMAIL_USER")
        gmail_pass = os.environ.get("GMAIL_APP_PASSWORD")
        candidate_email = cv_data.get("email")
        candidate_name = cv_data.get("nombre", "Candidato")

        # 6. Email Delivery
        gmail_user = os.environ.get("GMAIL_USER")
        gmail_pass = os.environ.get("GMAIL_APP_PASSWORD")
        candidate_email = cv_data.get("email")
        candidate_name = cv_data.get("nombre", "Candidato")

        email_status = "Sent"
        email_error = None

        if not gmail_user or not gmail_pass:
            email_status = "Missing Credentials"
            print(f"[{session_id}] Error: GMAIL_USER or GMAIL_APP_PASSWORD not set in environment.")
        elif not candidate_email:
            email_status = "Missing Email"
            print(f"[{session_id}] Warning: No candidate email found in parsed JSON.")
        else:
            print(f"[{session_id}] Sending email to {candidate_email}...")
            success = send_cvs_email(candidate_email, generated_pdfs, candidate_name, gmail_user, gmail_pass)
            if not success:
                email_status = "Failed"
                email_error = "SMTP Error"

        log_to_history(candidate_name, candidate_email or "N/A", email_status)

        return jsonify({
            "status": "success",
            "session_id": session_id,
            "candidate": candidate_name,
            "email_status": email_status,
            "cv_data": cv_data,
            "pdfs": [os.path.basename(p) for p in generated_pdfs]
        })

    except Exception as e:
        print(f"[{session_id}] Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/history')
def get_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return jsonify(json.load(f))
    return jsonify([])

@app.route('/serve_pdf/<session_id>/<filename>')
def serve_pdf(session_id, filename):
    folder = os.path.join(app.config['UPLOAD_FOLDER'], session_id, "output_cvs")
    return send_from_directory(folder, filename)

@app.route('/regenerate', methods=['POST'])
def regenerate():
    try:
        data = request.json
        session_id = data.get('session_id')
        cv_data = data.get('cv_data')
        
        if not session_id or not cv_data:
            return jsonify({"error": "Missing data"}), 400
            
        session_path = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
        output_dir = os.path.join(session_path, "output_cvs")
        
        # Look for processed profile photo
        processed_image = os.path.join(session_path, "processed_profile.png")
        if not os.path.exists(processed_image):
            processed_image = None
            
        # Regenerate all formats
        p1 = generate_divider(cv_data, output_dir, processed_image)
        p2 = generate_divider_smaller(cv_data, output_dir, processed_image)
        p3 = generate_divider_larger(cv_data, output_dir, processed_image)
        p4 = generate_divider_tiny(cv_data, output_dir, processed_image)
        generated_pdfs = [p1, p2, p3, p4]
        
        # Resend email
        gmail_user = os.environ.get("GMAIL_USER")
        gmail_pass = os.environ.get("GMAIL_APP_PASSWORD")
        candidate_email = cv_data.get("email")
        candidate_name = cv_data.get("nombre", "Candidato")
        
        email_status = "Sent"
        if not gmail_user or not gmail_pass:
            email_status = "Missing Credentials"
        elif not candidate_email:
            email_status = "Missing Email"
        else:
            success = send_cvs_email(candidate_email, generated_pdfs, candidate_name, gmail_user, gmail_pass)
            if not success:
                email_status = "Failed"
        
        log_to_history(candidate_name, candidate_email or "N/A", email_status + " (Edit)")
        
        return jsonify({
            "status": "success",
            "candidate": candidate_name,
            "email_status": email_status,
            "pdfs": [os.path.basename(p) for p in generated_pdfs]
        })
    except Exception as e:
        print(f"Regenerate error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
