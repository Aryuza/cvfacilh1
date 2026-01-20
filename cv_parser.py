import os
import json
import google.generativeai as genai
from typing import Dict, Any, List
import pypdf

# Configure Gemini API
# User must ensure GEMINI_API_KEY is set in environment variables
API_KEY = os.environ.get("GEMINI_API_KEY")
if API_KEY:
    genai.configure(api_key=API_KEY)

SYSTEM_PROMPT = """
Eres un especialista en extracción de datos para CVs optimizados para ATS.
Analiza la información provista y genera un objeto JSON con la estructura EXACTA detallada abajo.

ESTRUCTURA JSON REQUERIDA:
{
  "nombre": "Nombre completo",
  "telefono": "+54 9 XXXXXXXXXX",
  "email": "email@ejemplo.com",
  "ciudad": "Ciudad, Provincia",
  "linkedin": "link o vacío",
  "perfil": "Resumen profesional atractivo y humano",
  "experiencia": [
    {
      "puesto": "Título del cargo",
      "empresa": "Nombre de la empresa",
      "fechas": "Mes AAAA – Mes AAAA (u 'Actualidad')",
      "ubicacion": "Ciudad/Barrio (solo si es específico)",
      "logros": ["Tarea o logro con punto final."]
    }
  ],
  "educacion": [
    {
      "titulo": "Nombre del estudio o curso",
      "institucion": "Institución",
      "fechas": "Rango de fechas o año",
      "ubicacion": "Ciudad/Barrio (solo si es específico)"
    }
  ],
  "habilidades": ["Habilidad 1", "...", "Habilidad 8"],
  "idiomas": [{"idioma": "Español", "nivel": "Nativo"}, {"idioma": "Inglés", "nivel": "Nivel"}],
  "licencias": ["Información extra como movilidad o disponibilidad"]
}

REGLAS CRÍTICAS DE INTELIGENCIA Y FORMATO:
1. PROHIBICIÓN DE INVENCIÓN: No inventes NUNCA información que el usuario no proveyó. No uses palabras como "Desconocida", "No informado", o similares. Si un dato no está, usa string vacío ("").
2. UBICACIONES: Si no hay una ciudad o barrio específico, deja el campo de ubicación vacío (""). No pongas "Argentina" como ubicación genérica.
3. REFERENCIAS: Si se provee una referencia laboral (nombre/teléfono) para un trabajo, agrégala como el ÚLTIMO punto de la lista de 'logros' de esa experiencia específica. Formato: "Referencia: Nombre - Contacto".
4. ORDEN: Cronológico descendente (más reciente primero) para experiencia y educación.
5. HABILIDADES: Mínimo 8 habilidades profesionales.
6. LOGROS: Mínimo 2 por experiencia profesional. Si el usuario no los brinda, genera tareas profesionales realistas (pero NO inventes fechas ni empresas).
7. IDIOMA: Si hay otros idiomas, incluye siempre 'Español – Nativo'.
8. FECHAS: Si no hay una fecha o rango temporal claro, deja el campo vacío (""). PROHIBIDO inventar meses o años.
    9. Devuelve ÚNICAMENTE el JSON.
    """
    
import mimetypes
import time

def get_api_keys() -> List[str]:
    """Returns a list of API keys from the environment variable."""
    keys_str = os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEYS")
    if not keys_str:
        return []
    # Split by comma and clean whitespace
    return [k.strip() for k in keys_str.split(",") if k.strip()]

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extracts all text from a PDF file locally using pypdf."""
    text = ""
    try:
        reader = pypdf.PdfReader(pdf_path)
        for page in reader.pages:
            text += page.extract_text() + "\n"
    except Exception as e:
        print(f"Error extracting text from PDF {pdf_path}: {e}")
    return text

def upload_to_gemini(path: str, mime_type: str = None):
    """Uploads the given file to Gemini."""
    file = genai.upload_file(path, mime_type=mime_type)
    return file

def _parse_with_specific_key(key: str, file_paths: list[str]) -> Dict[str, Any]:
    """Helper that performs the actual parsing with a single configured key."""
    genai.configure(api_key=key)
    model = genai.GenerativeModel('gemini-flash-latest')
    
    content_parts = [SYSTEM_PROMPT, "\n\nINFORMACIÓN DEL USUARIO (Analiza todos los archivos adjuntos):"]
    
    for path in file_paths:
        mime_type, _ = mimetypes.guess_type(path)
        
        if mime_type and mime_type.startswith('text'):
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content_parts.append(f"\n--- Archivo (Texto): {os.path.basename(path)} ---\n{f.read()}")
            except Exception as ex:
                print(f"Error reading text file {path}: {ex}")
        elif mime_type == 'application/pdf':
            pdf_text = extract_text_from_pdf(path)
            if pdf_text:
                content_parts.append(f"\n--- Archivo (PDF): {os.path.basename(path)} ---\n{pdf_text}")
            else:
                uploaded_file = upload_to_gemini(path, mime_type=mime_type)
                content_parts.append(uploaded_file)
        else:
            uploaded_file = upload_to_gemini(path, mime_type=mime_type)
            content_parts.append(uploaded_file)

    response = model.generate_content(
        contents=content_parts,
        generation_config={"response_mime_type": "application/json"}
    )
    return json.loads(response.text)

def parse_cv_multimodal(file_paths: list[str]) -> Dict[str, Any]:
    """
    Sends multiple files to Gemini. Supports API Key rotation if multiple keys are provided.
    """
    keys = get_api_keys()
    if not keys:
        raise ValueError("No se encontró GEMINI_API_KEY en las variables de entorno.")

    last_err = None
    for i, key in enumerate(keys):
        try:
            if len(keys) > 1:
                print(f"Tentativa {i+1}/{len(keys)} con API Key que empieza en {key[:6]}...")
            
            return _parse_with_specific_key(key, file_paths)
            
        except Exception as e:
            last_err = e
            err_msg = str(e).lower()
            print(f"Error con API Key {i+1}: {e}")
            
            # If there are more keys, and the error seems like a quota or auth issue, try next
            if i < len(keys) - 1:
                if "429" in err_msg or "quota" in err_msg or "401" in err_msg or "expired" in err_msg:
                    print("Rotando a la siguiente API Key por error de cuota o validación...")
                    time.sleep(1)
                    continue
                else:
                    # For other errors (like prompt issues), don't bother rotating necessarily? 
                    # Actually, better rotate anyway if something went wrong.
                    print("Intentando con la siguiente clave por error genérico...")
                    continue
            else:
                print("Se agotaron todas las API Keys disponibles.")
                
    raise last_err
