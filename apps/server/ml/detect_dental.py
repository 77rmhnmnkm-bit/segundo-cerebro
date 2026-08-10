#!/usr/bin/env python3
"""Inferência de detecção odontológica (YOLOv8, modelo Apache-2.0 DentalXrayAI).

APOIO EXPERIMENTAL, NÃO-DIAGNÓSTICO. Recebe o caminho de uma imagem e devolve
JSON com as detecções em coordenadas relativas (0-1) para casar com a camada
de anotação do negatoscópio. O profissional confirma/rejeita cada sugestão.

Uso: python detect_dental.py <caminho_imagem>
Saída (stdout): {"detections": [{"label","confidence","x","y","w","h"}], "error"?}
"""
import json
import os
import sys

WEIGHTS = os.path.join(os.path.dirname(__file__), "dental_best.pt")
# Rótulos em PT para exibição. Cobrimos as classes do modelo nsitnov/8024
# (Apache-2.0) e também as do DentalXrayAI; classes desconhecidas caem no
# próprio nome do modelo (lido dinamicamente de r.names).
LABELS_PT = {
    "Caries": "Cárie",
    "Deep Caries": "Cárie profunda",
    "Crown": "Coroa",
    "Filling": "Restauração",
    "Implant": "Implante",
    "Missing-tooth-between": "Dente ausente",
    "Periapical-lesion": "Lesão periapical",
    "Periapical Lesion": "Lesão periapical",
    "Root pieces": "Raiz residual",
    "Root Piece": "Raiz residual",
    "Root canal obturation": "Obturação de canal",
    "Root Canal Treatment": "Tratamento de canal",
    "Impacted": "Dente impactado",
}


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: detect_dental.py <imagem>"}))
        return
    image_path = sys.argv[1]
    # Limiar de confiança opcional (argv[2]). Mais baixo = mostra TODOS os
    # achados que o modelo consegue (inclusive baixa confiança); mais alto = só
    # os fortes. Faixa segura 0.05–0.6.
    try:
        conf = float(sys.argv[2]) if len(sys.argv) > 2 else 0.25
    except ValueError:
        conf = 0.25
    conf = max(0.05, min(0.6, conf))
    if not os.path.exists(WEIGHTS):
        print(json.dumps({"error": "Pesos do detector não encontrados. Baixe dental_best.pt."}))
        return
    try:
        from ultralytics import YOLO

        model = YOLO(WEIGHTS)
        results = model.predict(image_path, imgsz=640, conf=conf, verbose=False)
        detections = []
        for r in results:
            names = r.names
            w_img = r.orig_shape[1]
            h_img = r.orig_shape[0]
            # Polígonos da máscara de segmentação (contorno real do achado, em
            # pixels). Pode ser None em modelos só de detecção — caímos na caixa.
            mask_polys = None
            if getattr(r, "masks", None) is not None and r.masks is not None:
                mask_polys = r.masks.xy  # lista de arrays Nx2 (x,y) em pixels
            for i, box in enumerate(r.boxes):
                cls = names[int(box.cls[0])]
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                det = {
                    "label": LABELS_PT.get(cls, cls),
                    "confidence": round(float(box.conf[0]), 3),
                    "x": round(x1 / w_img, 4),
                    "y": round(y1 / h_img, 4),
                    "w": round((x2 - x1) / w_img, 4),
                    "h": round((y2 - y1) / h_img, 4),
                }
                # Contorno (linha em volta da extensão), normalizado 0-1. Reduz a
                # densidade de pontos para não inflar o payload nem o desenho.
                if mask_polys is not None and i < len(mask_polys):
                    poly = mask_polys[i]
                    step = max(1, len(poly) // 60)
                    pts = [
                        {"x": round(float(px) / w_img, 4), "y": round(float(py) / h_img, 4)}
                        for px, py in poly[::step]
                    ]
                    if len(pts) >= 3:
                        det["points"] = pts
                detections.append(det)
        print(json.dumps({"detections": detections}))
    except Exception as exc:  # noqa: BLE001 — devolve erro limpo pro backend
        print(json.dumps({"error": str(exc)}))


if __name__ == "__main__":
    main()
