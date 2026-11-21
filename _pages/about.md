---
permalink: /
title: "个人主页"
hide_title: true
author_profile: true
redirect_from:
  - /about/
  - /about.html
---
{% assign data = site.data.site_content %}
{% include resolved-profile.html %}
{% assign home = data.website.home %}
{% assign home_text = data.website.text.home %}
{% assign preferred_text = home_text.preferredName | default: site.data.website_text.home.preferredName %}
{% assign interests_text = home_text.interests | default: site.data.website_text.home.interests %}
{% assign contact_text = home_text.contact | default: site.data.website_text.home.contact %}
{% assign cv_text = home_text.cv | default: site.data.website_text.home.cv %}
{% assign github_text = home_text.github | default: site.data.website_text.home.github %}

<div class="home-intro">
  <h1 class="home-intro__name">{{ profile_name | escape }}{% if profile_name_en != "" and profile_name_en %}<span> / {{ profile_name_en | escape }}</span>{% endif %}</h1>
  {% if preferred_text.visible and profile_preferred_name != "" and profile_preferred_name %}<p class="home-intro__preferred">{{ preferred_text.label | escape }}{{ profile_preferred_name | escape }}</p>{% endif %}
  {% if profile_headline != "" and profile_headline %}<p class="home-intro__headline">{{ profile_headline | escape }}</p>{% endif %}
  {% if profile_summary != "" and profile_summary %}<p class="home-intro__summary">{{ profile_summary | escape | newline_to_br }}</p>{% endif %}
  {% if profile_motto != "" and profile_motto %}<p class="home-intro__motto">{{ profile_motto | escape }}</p>{% endif %}

  {% if interests_text.visible and profile_interests.size > 0 %}
    <div class="home-intro__interests" aria-label="{{ interests_text.label | escape }}">
      <span>{{ interests_text.label | escape }}</span>
      <ul>
        {% for interest in profile_interests %}
          {% if interest != "" %}<li>{{ interest | escape }}</li>{% endif %}
        {% endfor %}
      </ul>
    </div>
  {% endif %}

  <div class="home-intro__actions">
    {% if contact_text.visible and profile_email != "" and profile_email %}<a href="mailto:{{ profile_email | escape }}">{{ contact_text.label | escape }}</a>{% endif %}
    {% if cv_text.visible %}<a href="{{ base_path }}/cv/">{{ cv_text.label | escape }}</a>{% endif %}
    {% if github_text.visible and data.profile.links.github != blank %}<a href="{{ data.profile.links.github | escape }}" target="_blank" rel="noopener noreferrer">{{ github_text.label | escape }}</a>{% endif %}
  </div>
</div>

{% if home.introduction and home.introduction != "" %}<div class="home-welcome">{{ home.introduction | escape | newline_to_br }}</div>{% endif %}

{% assign home_sections = home.sections %}
{% if home_sections == nil %}{% assign home_sections = site.data.home_sections %}{% endif %}
{% for section in home_sections %}
  {% if section.visible %}
    {% assign items = data[section.key] | where: "published", true %}
    {% if section.source == "featured" %}{% assign items = items | where: "featured", true %}{% endif %}
    {% assign target = site.data.navigation.main | where: "section", section.key | first %}
    {% include content/section.html id=section.key title=section.title description=section.description items=items href=target.url limit=section.limit %}
  {% endif %}
{% endfor %}
