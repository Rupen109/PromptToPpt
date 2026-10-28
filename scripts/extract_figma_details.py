import json

def rgb_to_hex(r, g, b):
    return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"

def extract_node_data(node, out, indent_level=0):
    indent = "  " * indent_level
    name = node.get('name', 'Unknown')
    type_ = node.get('type', 'Unknown')
    
    # Text data
    text = ""
    font_family = ""
    font_weight = ""
    font_size = ""
    
    if type_ == "TEXT":
        text = node.get('characters', '').replace('\n', ' ')
        style = node.get('style', {})
        font_family = style.get('fontFamily', '')
        font_weight = style.get('fontWeight', '')
        font_size = style.get('fontSize', '')
        
    # Fills (background colors, text colors)
    fills = node.get('fills', [])
    colors = []
    for fill in fills:
        if isinstance(fill, dict):
            if fill.get('type') == 'SOLID' and 'color' in fill:
                c = fill['color']
                colors.append(rgb_to_hex(c.get('r',0), c.get('g',0), c.get('b',0)))
            elif fill.get('type') == 'GRADIENT_LINEAR':
                colors.append('GRADIENT_LINEAR')

    # Output node info
    line = f"{indent}{type_}: '{name}'"
    if colors:
        line += f" | FILLS: {colors}"
    if type_ == "TEXT":
        line += f" | FONT: {font_family} {font_size}px (w:{font_weight})"
        short_text = text[:60] + "..." if len(text) > 60 else text
        line += f" | TEXT: \"{short_text}\""
        
    out.write(line + "\n")
    
    for child in node.get('children', []):
        extract_node_data(child, out, indent_level + 1)

with open(r'd:\SlidesDone\figma_data.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

with open(r'd:\SlidesDone\figma_details.txt', 'w', encoding='utf-8') as out:
    doc = data.get('document', {})
    extract_node_data(doc, out)
