=== Claritia Forms ===
Contributors: claritia
Tags: form, booking, lead form, contact form, scheduling
Requires at least: 6.3
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add your Claritia forms to WordPress with a block or a shortcode.

== Description ==

Claritia forms turn visitors into leads and book meetings with the right person. This plugin puts a form on any page:

* The Claritia form block: paste the form's link and pick how it shows (in the page, full page, popup, slider, popover or side tab).
* The shortcode: `[claritia form="https://app.tryclaritia.com/f/FORM-ID" mode="inline"]`.

The plugin prints the same code as the form's Share tab in Claritia. It needs a Claritia account.

= External service =

This plugin loads the form from Claritia (app.tryclaritia.com) when a visitor opens the page, and the visitor's answers go to Claritia when they send the form. Terms: https://tryclaritia.com/terms. Privacy: https://tryclaritia.com/privacy.

== Installation ==

1. Upload the plugin and activate it.
2. In Claritia, open the form's Share tab and copy its link.
3. Add the Claritia form block to a page and paste the link, or use the shortcode.

== Frequently Asked Questions ==

= Which modes are there? =

inline, full, popup, slider, popover and sidetab. Popup and slider show a button, and the side tab shows a tab; `text` sets its words.

= What if the link is wrong? =

Nothing shows on the page. The block's editor says when it can't find a form in the link.

== Changelog ==

= 1.0.0 =
* The Claritia form block and the [claritia] shortcode.
