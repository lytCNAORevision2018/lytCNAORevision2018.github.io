---
layout: archive
title: "网站地图"
permalink: /sitemap/
author_profile: true
---

{% assign data = site.data.site_content %}

- [个人主页](/)
- [个人简历](/cv/)
{% for link in site.data.navigation.main %}
  {% if link.section %}
    {% assign published_items = data[link.section] | where: "published", true %}
    {% if published_items.size > 0 %}- [{{ link.title }}]({{ link.url }}){% endif %}
  {% endif %}
{% endfor %}
- [XML 网站地图](/sitemap.xml)
