#!/usr/bin/env python3

import requests
from bs4 import BeautifulSoup
import json
import re
import os
import argparse
import sys

CACHE_DIR = 'html_cache'


def get_talk_details(talk_url):
    """
    Fetches and parses the talk detail page to get the abstract/description.
    Uses a local cache to avoid re-fetching URLs.

    Args:
        talk_url (str): The URL of the talk's detail page.

    Returns:
        str: The extracted details/abstract of the talk, or an error message.
    """
    if not talk_url or not talk_url.startswith('http'):
        return "No details link provided."

    # Generate a safe filename for the cache from the URL
    try:
        # Assumes URLs end with a slug like '.../talk-title/'
        slug = talk_url.strip('/').split('/')[-1]
        cache_filename = f"{slug}.html"
        cache_filepath = os.path.join(CACHE_DIR, cache_filename)
    except IndexError:
        # Fallback for unexpected URL formats
        safe_slug = re.sub(r'[^a-zA-Z0-9]', '_', talk_url)
        cache_filename = f"{safe_slug}.html"
        cache_filepath = os.path.join(CACHE_DIR, cache_filename)

    html_content = None
    if os.path.exists(cache_filepath):
        print(f"  Loading from cache: {talk_url}")
        with open(cache_filepath, 'r', encoding='utf-8') as f:
            html_content = f.read()
    else:
        try:
            print(f"  Fetching details from: {talk_url}")
            response = requests.get(talk_url, timeout=15)
            response.raise_for_status()
            html_content = response.content  # in bytes
            with open(cache_filepath, 'wb') as f:
                f.write(html_content)
        except requests.RequestException as e:
            return f"Failed to fetch details: {e}"

    if not html_content:
        return "Failed to load HTML content."

    return parse_details_html(html_content)


def parse_details_html(html_content):
    """
    Shared parser for a talk detail HTML blob (bytes or str).
    Returns the extracted details string or an error message.
    """
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        # The main content of the talk pages seems to be within this class structure.
        content_div = soup.select_one('div.gt-site-inner div.gt-content')
        # print(content_div)
        if content_div:
            # Extract text from all paragraphs within the main content wrapper
            paragraphs = content_div.find_all('p')
            details = '\n'.join(p.get_text(strip=True) for p in paragraphs)
            # A simple cleanup to remove common boilerplate text
            if "Please note the program" in details:
                return "Details not found on this page."
            return details.strip() if details else "No abstract or details found."
        return "Could not find content wrapper on the page."
    except Exception as e:
        return f"Error parsing HTML: {e}"


def parse_program(html_content):
    """
    Parses the main program HTML to extract information about each talk.

    Args:
        html_content (str): The HTML content of the program page.

    Returns:
        list: A list of dictionaries, where each dictionary represents a talk.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    all_talks = []

    # The program is structured into divs, one for each day of the week.
    days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

    for day in days:
        day_div = soup.find('div', id=day)
        if not day_div:
            continue

        print(f"\nProcessing talks for {day.capitalize()}...")

        # The schedule for each day is in a table.
        table = day_div.find('table')
        if not table:
            continue

        rows = table.find_all('tr')
        rooms = []
        session_chairs = []

        # We need to keep track of cells that span multiple rows (for BoF sessions)
        rowspan_offsets = {}

        for row_idx, row in enumerate(rows):
            cells = row.find_all('td')

            # Adjust cells based on previous rowspans
            offset_idx = 0
            for col_idx in sorted(rowspan_offsets.keys()):
                if rowspan_offsets[col_idx] > 1:
                    cells.insert(col_idx, None)  # Placeholder for spanned cell
                    rowspan_offsets[col_idx] -= 1
                else:
                    del rowspan_offsets[col_idx]

            if not cells or not cells[0]:
                continue

            first_cell_text = cells[0].get_text(strip=True)

            # Check for header rows to get context like room names and chairs
            if 'Room' in first_cell_text:
                rooms = [cell.get_text(strip=True) for cell in cells[1:]]
                continue
            if 'Session Chair' in first_cell_text:
                session_chairs = [cell.get_text(
                    strip=True) for cell in cells[1:]]
                continue

            # A talk row is identified by having a time in the first cell.
            if re.match(r'\d{2}:\d{2}\s*–\s*\d{2}:\d{2}', first_cell_text) or re.match(r'\d{2}:\d{2}\s*-\s*\d{2}:\d{2}', first_cell_text):
                time = first_cell_text

                # Iterate through the cells in the row, which correspond to different rooms/tracks
                for i, cell in enumerate(cells[1:]):
                    if cell is None:  # This cell is spanned by a previous row
                        continue

                    # Handle cells that span multiple rows (BoF sessions)
                    if cell.has_attr('rowspan'):
                        rowspan_offsets[i] = int(cell['rowspan'])

                    # Skip empty cells
                    if not cell.get_text(strip=True):
                        continue

                    link_tag = cell.find('a', href=True)

                    talk = {
                        "day": day.capitalize(),
                        "time": time,
                        "location": rooms[i] if i < len(rooms) else "N/A",
                        "session_chair": session_chairs[i] if i < len(session_chairs) else "N/A",
                        "title": "N/A",
                        "authors": "N/A",
                        "url": "N/A",
                        "details": "N/A"
                    }

                    if link_tag:
                        talk['title'] = link_tag.get_text(strip=True)
                        talk['url'] = link_tag['href']

                        # Find authors, who are often in a <p> tag following the link
                        author_p = cell.find('p')
                        if author_p:
                            talk['authors'] = author_p.get_text(strip=True)
                        else:  # Fallback for different structures
                            # Get all text nodes, title is first, author is often last.
                            text_nodes = [
                                text for text in cell.stripped_strings]
                            if len(text_nodes) > 1:
                                talk['authors'] = text_nodes[-1]
                    else:
                        # Handle cells without links (e.g., panel descriptions)
                        talk['title'] = ' '.join(
                            cell.get_text(strip=True).split())

                    # Fetch details only if a valid URL was found
                    if talk["url"] != "N/A":
                        talk['details'] = get_talk_details(talk['url'])

                    all_talks.append(talk)

    return all_talks


def extract_details_from_cached(cache_filename):
    """
    Read a cached HTML file from CACHE_DIR and extract the talk details
    (using the same parsing logic as get_talk_details).
    """
    possible_names = [cache_filename, f"{cache_filename}.html"]
    for name in possible_names:
        # path = os.path.join(CACHE_DIR, name)
        path = name
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                html = f.read()
            return parse_details_html(html)
    return f"Cached file not found in {CACHE_DIR}: tried {possible_names}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Parse conference program or test cached detail pages.")
    parser.add_argument(
        '--cache-file', help="Name of a cached HTML file in html_cache to parse (for testing details).")
    args = parser.parse_args()

    # Create cache directory if it doesn't exist
    os.makedirs(CACHE_DIR, exist_ok=True)

    if args.cache_file:
        result = extract_details_from_cached(args.cache_file)
        print("\n--- Extracted Details ---\n")
        print(result)
        sys.exit(0)

    html_file_path = 'Program.html'
    json_output_path = 'conference_program.json'

    if not os.path.exists(html_file_path):
        print(f"Error: The file '{html_file_path}' was not found.")
        print("Please make sure the HTML file is in the same directory as the script.")
    else:
        with open(html_file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        print("Starting to parse the conference program...")
        conference_data = parse_program(html_content)

        print(f"\nParsing complete. Found {len(conference_data)} talks.")

        with open(json_output_path, 'w', encoding='utf-8') as f:
            json.dump(conference_data, f, indent=4, ensure_ascii=False)

        print(
            f"Successfully wrote all talk information to '{json_output_path}'")
