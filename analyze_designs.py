import os
import google.generativeai as genai
from typing import List

genai.configure(api_key="AIzaSyCvtvkP8fJAJRlLrj1NbsTl-SEeUZtYgSA")

def analyze_templates(file_paths: List[str]):
    model = genai.GenerativeModel('gemini-1.5-flash')
    uploaded_files = []
    
    for path in file_paths:
        print(f"Uploading {path}...")
        f = genai.upload_file(path)
        uploaded_files.append(f)
    
    prompt = """
    Analiza estos modelos de CV (están en portugués, pero enfócate en el DISEÑO VISUAL).
    Describe para cada uno:
    1. Disposición de columnas (¿1 columna, 2 columnas?).
    2. Colores destacados (¿Azul, Negro, Gris?).
    3. Elementos visuales (¿Líneas, iconos, círculos para la foto?).
    4. Estilo general (¿Moderno, Clásico, Minimalista?).
    
    El objetivo es que yo pueda replicar estos estilos usando la librería ReportLab en Python.
    """
    
    response = model.generate_content([prompt] + uploaded_files)
    print("\n--- ANALISIS DE DISEÑO ---\n")
    print(response.text)

if __name__ == "__main__":
    templates = [
        r'c:\Users\Nico\.gemini\antigravity\scratch\cv_automation_lab\referencias_portugues\Curriculo 1.docx',
        r'c:\Users\Nico\.gemini\antigravity\scratch\cv_automation_lab\referencias_portugues\Curriculo 4.docx',
        r'c:\Users\Nico\.gemini\antigravity\scratch\cv_automation_lab\referencias_portugues\Curriculo 6.docx'
    ]
    analyze_templates(templates)
