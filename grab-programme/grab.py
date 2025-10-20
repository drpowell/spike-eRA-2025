#!/usr/bin/env python3

import requests
from bs4 import BeautifulSoup
import json

def crawl_conference_program():
    """
    Crawls the eResearch Australasia conference program page to collect talk details.

    Returns:
        str: A JSON string containing a list of talks with their title, time, 
             location, details URL, and full description.
    """
    base_url = "https://conference.eresearch.edu.au"
    program_url = f"{base_url}/program/"
    all_talks = []

    try:
        response = requests.get(program_url)
        # Raise an exception if the page is not found or there's a server error
        response.raise_for_status() 
    except requests.exceptions.RequestException as e:
        error_message = {"error": f"Failed to retrieve the program page: {e}"}
        return json.dumps(error_message, indent=4)

    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Find all talk items on the program page
    talk_elements = soup.find_all('div', class_='b-talks-item')

    for talk_element in talk_elements:
        try:
            title_element = talk_element.find('h4', class_='b-talks-item__title').find('a')
            time_element = talk_element.find('div', class_='b-talks-item__time')
            location_element = talk_element.find('div', class_='b-talks-item__location')

            if not all([title_element, time_element, location_element]):
                continue

            title = title_element.get_text(strip=True)
            time = time_element.get_text(strip=True)
            location = location_element.get_text(strip=True)
            details_url = base_url + title_element['href']

            # --- Follow the link to get the talk details ---
            details_text = "Details could not be retrieved."
            try:
                details_response = requests.get(details_url)
                details_response.raise_for_status()
                details_soup = BeautifulSoup(details_response.content, 'html.parser')
                
                # The main content/abstract is within a 'div' with class 's-editor'
                details_content = details_soup.find('div', class_='s-editor')
                if details_content:
                    details_text = details_content.get_text(strip=True)
            except requests.exceptions.RequestException as e:
                details_text = f"Error fetching details: {e}"

            all_talks.append({
                "title": title,
                "time": time,
                "location": location,
                "details_url": details_url,
                "details": details_text,
            })

        except AttributeError:
            # Skip items that don't have the expected structure (e.g., breaks, posters)
            continue
            
    return json.dumps(all_talks, indent=4)

if __name__ == '__main__':
    conference_data_json = crawl_conference_program()
    print(conference_data_json)
    