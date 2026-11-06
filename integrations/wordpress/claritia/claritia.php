<?php
/**
 * Plugin Name:       Claritia Forms
 * Plugin URI:        https://tryclaritia.com
 * Description:       Add a Claritia form to any page with a block or the [claritia] shortcode.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Claritia
 * License:           GPL-2.0-or-later
 * Text Domain:       claritia
 *
 * The block and the shortcode print the same code as the form's Share tab (src/lib/share/embed.ts): the form script,
 * then the <claritia-form> element in the mode picked. A form id or link that isn't one prints nothing.
 */

if (!defined('ABSPATH') && !defined('CLARITIA_TEST')) {
	exit;
}

const CLARITIA_ORIGIN = 'https://app.tryclaritia.com';
const CLARITIA_MODES = array('inline', 'full', 'popup', 'slider', 'popover', 'sidetab');

/** Text safe inside a double-quoted attribute or between tags, as the Share tab makes it. */
function claritia_safe($s, $max = 60) {
	$s = trim(preg_replace('/[\x00-\x1f]/u', ' ', (string) $s));
	$s = function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max);
	return htmlspecialchars($s, ENT_COMPAT | ENT_SUBSTITUTE, 'UTF-8');
}

/** The form's id from an id or any Claritia link that holds one, or '' when there isn't one. */
function claritia_form_id($form) {
	return preg_match('/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i', (string) $form, $m) ? strtolower($m[1]) : '';
}

/** The embed code for a form, a mode and the button or tab text. */
function claritia_embed($form, $mode = 'inline', $text = '') {
	$id = claritia_form_id($form);
	if ($id === '') {
		return '';
	}
	$mode = in_array($mode, CLARITIA_MODES, true) ? $mode : 'inline';
	$text = trim((string) $text);
	$attrs = array('form-id="' . $id . '"');
	$button = '';
	switch ($mode) {
		case 'full':
			$attrs[] = 'full';
			break;
		case 'popup':
			$attrs[] = 'popup="click"';
			$attrs[] = 'size="m"';
			break;
		case 'slider':
			$attrs[] = 'slider="right"';
			$attrs[] = 'popup="click"';
			break;
		case 'popover':
			$attrs[] = 'popover';
			$attrs[] = 'icon="chat"';
			break;
		case 'sidetab':
			$attrs[] = 'side-tab="' . claritia_safe($text !== '' ? $text : 'Contact us', 40) . '"';
			break;
	}
	if ($mode === 'popup' || $mode === 'slider') {
		$button = "\n" . '<button data-claritia-open="' . $id . '">' . claritia_safe($text !== '' ? $text : 'Open the form') . '</button>';
	}
	return '<script src="' . CLARITIA_ORIGIN . '/forms/v1.js" async></script>' . "\n" . '<claritia-form ' . implode(' ', $attrs) . '></claritia-form>' . $button;
}

/** [claritia form="ID or link" mode="inline" text="Open the form"] */
function claritia_shortcode($atts) {
	$a = shortcode_atts(array('form' => '', 'mode' => 'inline', 'text' => ''), $atts, 'claritia');
	return claritia_embed($a['form'], $a['mode'], $a['text']);
}

/** The block: the same code, drawn on the server from its settings. */
function claritia_register() {
	add_shortcode('claritia', 'claritia_shortcode');
	register_block_type(__DIR__ . '/block', array(
		'render_callback' => function ($attributes) {
			return claritia_embed($attributes['form'] ?? '', $attributes['mode'] ?? 'inline', $attributes['text'] ?? '');
		},
	));
}

if (function_exists('add_action')) {
	add_action('init', 'claritia_register');
}
