import json

with open(r'd:\SlidesDone\figma_data.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

with open(r'd:\SlidesDone\figma_structure.txt', 'w', encoding='utf-8') as out:
    # Extract styles
    styles = data.get('styles', {})
    out.write('=== STYLES ===\n')
    out.write(json.dumps(styles, indent=2) + '\n')
    
    # Extract document structure
    doc = data.get('document', {})
    pages = doc.get('children', [])
    for page in pages:
        out.write(f'\nPAGE: {page["name"]} | id: {page["id"]}\n')
        for child in page.get('children', []):
            out.write(f'  FRAME: {child["name"]} | type: {child["type"]}\n')
            for grandchild in child.get('children', []):
                out.write(f'    CHILD: {grandchild["name"]} | type: {grandchild["type"]}\n')
                for ggchild in grandchild.get('children', []):
                    out.write(f'      ELEMENT: {ggchild["name"]} | type: {ggchild["type"]}\n')
