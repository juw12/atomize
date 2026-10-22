#!/usr/bin/env python3
"""
Schema validation test for curriculum.json.
Exit 0 if all pass, 1 if any fail.
"""

import json
import sys
from pathlib import Path


def main():
    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent
    data_file = project_dir / 'data' / 'curriculum.json'
    web_dir = project_dir / 'web'
    index_html = web_dir / 'index.html'
    mobile_html = web_dir / 'mobile.html'
    
    all_pass = True
    
    # Load data
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print("OK: curriculum.json loaded")
    except Exception as e:
        print(f"FAIL: Cannot load curriculum.json: {e}")
        sys.exit(1)
    
    # Check required top-level keys
    required_keys = ['version', 'metadata', 'strings', 'levels', 'quiz_questions', 'quiz_results']
    for key in required_keys:
        if key not in data:
            print(f"FAIL: Missing required key '{key}'")
            all_pass = False
        else:
            print(f"OK: Required key '{key}' present")
    
    # Check metadata
    if 'title' not in data.get('metadata', {}):
        print("FAIL: metadata missing 'title'")
        all_pass = False
    if 'description' not in data.get('metadata', {}):
        print("FAIL: metadata missing 'description'")
        all_pass = False
    
    # Validate strings have en and id
    strings = data.get('strings', {})
    for key, val in strings.items():
        if 'en' not in val or 'id' not in val:
            print(f"FAIL: String '{key}' missing en or id translation")
            all_pass = False
    print(f"OK: {len(strings)} strings validated (bilingual)")
    
    # Build lookup maps
    lesson_ids = set()
    
    # Validate levels
    for level in data.get('levels', []):
        for field in ['id', 'title', 'description', 'modules']:
            if field not in level:
                print(f"FAIL: Level missing '{field}': {level.get('id')}")
                all_pass = False
        
        # Check title/description bilingual
        if 'en' not in level.get('title', {}) or 'id' not in level.get('title', {}):
            print(f"FAIL: Level '{level.get('id')}' title not bilingual")
            all_pass = False
        
        # Validate modules
        for module in level.get('modules', []):
            for field in ['id', 'title', 'lessons']:
                if field not in module:
                    print(f"FAIL: Module missing '{field}': {module.get('id')}")
                    all_pass = False
            
            # Validate lessons
            for lesson in module.get('lessons', []):
                lesson_ids.add(lesson.get('id'))
                
                # Required lesson fields
                for field in ['id', 'title', 'concept', 'prompts', 'sources']:
                    if field not in lesson:
                        print(f"FAIL: Lesson '{lesson.get('id')}' missing '{field}'")
                        all_pass = False
                
                # Check bilingual title and concept
                if 'en' not in lesson.get('title', {}) or 'id' not in lesson.get('title', {}):
                    print(f"FAIL: Lesson '{lesson.get('id')}' title not bilingual")
                    all_pass = False
                
                if 'en' not in lesson.get('concept', {}) or 'id' not in lesson.get('concept', {}):
                    print(f"FAIL: Lesson '{lesson.get('id')}' concept not bilingual")
                    all_pass = False
                
                # Validate prompts
                for prompt in lesson.get('prompts', []):
                    for field in ['task', 'core_prompt', 'adaptations']:
                        if field not in prompt:
                            print(f"FAIL: Prompt in lesson '{lesson.get('id')}' missing '{field}'")
                            all_pass = False
                    
                    # Check bilingual task and core_prompt
                    if 'en' not in prompt.get('task', {}) or 'id' not in prompt.get('task', {}):
                        print(f"FAIL: Prompt task not bilingual in lesson '{lesson.get('id')}'")
                        all_pass = False
                    
                    if 'en' not in prompt.get('core_prompt', {}) or 'id' not in prompt.get('core_prompt', {}):
                        print(f"FAIL: Prompt core_prompt not bilingual in lesson '{lesson.get('id')}'")
                        all_pass = False
                    
                    # Check adaptations have all model variants
                    adaptations = prompt.get('adaptations', {})
                    for model in ['claude', 'gpt', 'gemini', 'local']:
                        if model not in adaptations:
                            print(f"FAIL: Prompt missing '{model}' adaptation in lesson '{lesson.get('id')}'")
                            all_pass = False
                        else:
                            if 'en' not in adaptations[model] or 'id' not in adaptations[model]:
                                print(f"FAIL: '{model}' adaptation not bilingual in lesson '{lesson.get('id')}'")
                                all_pass = False
                
                # Validate sources
                for source in lesson.get('sources', []):
                    for field in ['title', 'url', 'citation']:
                        if field not in source:
                            print(f"FAIL: Source in lesson '{lesson.get('id')}' missing '{field}'")
                            all_pass = False
                    
                    # Check bilingual title and citation
                    if 'en' not in source.get('title', {}) or 'id' not in source.get('title', {}):
                        print(f"FAIL: Source title not bilingual in lesson '{lesson.get('id')}'")
                        all_pass = False
    
    print(f"OK: {len(lesson_ids)} lessons validated")
    
    # Validate quiz_questions
    for i, q in enumerate(data.get('quiz_questions', [])):
        for field in ['id', 'question', 'options']:
            if field not in q:
                print(f"FAIL: Quiz question {i+1} missing '{field}'")
                all_pass = False
        
        # Check bilingual question
        if 'en' not in q.get('question', {}) or 'id' not in q.get('question', {}):
            print(f"FAIL: Quiz question {i+1} not bilingual")
            all_pass = False
        
        # Check options
        for j, opt in enumerate(q.get('options', [])):
            if 'text' not in opt or 'type' not in opt:
                print(f"FAIL: Quiz question {i+1} option {j+1} missing fields")
                all_pass = False
            if 'en' not in opt.get('text', {}) or 'id' not in opt.get('text', {}):
                print(f"FAIL: Quiz question {i+1} option {j+1} not bilingual")
                all_pass = False
    
    print(f"OK: {len(data.get('quiz_questions', []))} quiz questions validated")
    
    # Validate quiz_results
    result_types = ['professor', 'builder', 'detective', 'guardian', 'all_rounder']
    for rt in result_types:
        if rt not in data.get('quiz_results', {}):
            print(f"FAIL: Quiz result '{rt}' missing")
            all_pass = False
        else:
            result = data['quiz_results'][rt]
            for field in ['title', 'description', 'tips']:
                if field not in result:
                    print(f"FAIL: Quiz result '{rt}' missing '{field}'")
                    all_pass = False
    print("OK: All 5 quiz result types present")
    
    # Validate tips array (new for dashboard)
    if 'tips' not in data:
        print("FAIL: Missing 'tips' array")
        all_pass = False
    else:
        tips = data['tips']
        if not isinstance(tips, list) or len(tips) == 0:
            print("FAIL: 'tips' should be a non-empty array")
            all_pass = False
        else:
            for i, tip in enumerate(tips):
                if 'id' not in tip:
                    print(f"FAIL: Tip {i+1} missing 'id'")
                    all_pass = False
                if 'text' not in tip:
                    print(f"FAIL: Tip {i+1} missing 'text'")
                    all_pass = False
                else:
                    if 'en' not in tip['text'] or 'id' not in tip['text']:
                        print(f"FAIL: Tip {i+1} 'text' not bilingual")
                        all_pass = False
            print(f"OK: {len(tips)} tips validated (bilingual)")
    
    # Validate glossary array (new for dashboard)
    if 'glossary' not in data:
        print("FAIL: Missing 'glossary' array")
        all_pass = False
    else:
        glossary = data['glossary']
        if not isinstance(glossary, list) or len(glossary) == 0:
            print("FAIL: 'glossary' should be a non-empty array")
            all_pass = False
        else:
            for i, term in enumerate(glossary):
                for field in ['id', 'term', 'definition']:
                    if field not in term:
                        print(f"FAIL: Glossary term {i+1} missing '{field}'")
                        all_pass = False
                
                if 'en' not in term.get('term', {}) or 'id' not in term.get('term', {}):
                    print(f"FAIL: Glossary term {i+1} 'term' not bilingual")
                    all_pass = False
                
                if 'en' not in term.get('definition', {}) or 'id' not in term.get('definition', {}):
                    print(f"FAIL: Glossary term {i+1} 'definition' not bilingual")
                    all_pass = False
            print(f"OK: {len(glossary)} glossary terms validated (bilingual)")
    
    # Check HTML files exist and have no fetch/XMLHttpRequest
    for html_file in [index_html, mobile_html]:
        if not html_file.exists():
            print(f"FAIL: {html_file.name} does not exist")
            all_pass = False
            continue
        
        print(f"OK: {html_file.name} exists")
        
        content = html_file.read_text(encoding='utf-8')
        
        # Check for fetch( or XMLHttpRequest
        if 'fetch(' in content or 'XMLHttpRequest' in content:
            print(f"FAIL: {html_file.name} contains fetch( or XMLHttpRequest")
            all_pass = False
        else:
            print(f"OK: {html_file.name} has no fetch/XMLHttpRequest")
        
        # Check for localStorage key
        if 'ailene_open_v1' not in content:
            print(f"FAIL: {html_file.name} missing localStorage key 'ailene_open_v1'")
            all_pass = False
        else:
            print(f"OK: {html_file.name} contains localStorage key 'ailene_open_v1'")
        
        # Check for absolute paths
        if 'src="/' in content or 'href="/' in content:
            print(f"FAIL: {html_file.name} contains absolute paths")
            all_pass = False
        else:
            print(f"OK: {html_file.name} has no absolute paths")
        
        # Check for <base> tag
        if '<base ' in content or '<base>' in content:
            print(f"FAIL: {html_file.name} contains <base> tag")
            all_pass = False
        else:
            print(f"OK: {html_file.name} has no <base> tag")
    
    # Summary
    print()
    if all_pass:
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("TESTS FAILED")
        sys.exit(1)


if __name__ == '__main__':
    main()
